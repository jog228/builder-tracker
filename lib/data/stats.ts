import "server-only";
import { dayLabel } from "@/lib/format";
import { TIME_ZONE } from "@/lib/scoring/config";
import { localDate, monthKey, prevWeek, weekKey } from "@/lib/scoring/time";
import { fetchAll, one } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

const WEEKS = 10;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  hourCycle: "h23",
});

type Row = {
  created_at: string;
  member_id: string;
  members:
    { exclude_from_rankings: boolean } | { exclude_from_rankings: boolean }[];
  message_scores: { category: string } | { category: string }[] | null;
};

/** Group-wide activity, counting rankable members only (exec board excluded). */
export async function getStats() {
  const supabase = await createClient();
  const [rows, events] = await Promise.all([
    fetchAll<Row>((f, t) =>
      supabase
        .from("messages")
        .select(
          "created_at, member_id, members!inner(exclude_from_rankings), message_scores(category)",
        )
        .eq("sender_type", "user")
        .eq("members.exclude_from_rankings", false)
        .range(f, t),
    ),
    supabase
      .from("events")
      .select("name, date, weekly, attendance(count)")
      .order("date"),
  ]);

  const isUpdate = (r: Row) => {
    const c = one(r.message_scores)?.category;
    return c === "progress_update" || c === "shipped_candidate";
  };

  // Updates and active builders per week, oldest first.
  const weeks: string[] = [];
  for (let w = weekKey(new Date()), i = 0; i < WEEKS; i++, w = prevWeek(w))
    weeks.unshift(w);
  const perWeek = new Map(
    weeks.map((w) => [w, { updates: 0, builders: new Set<string>() }]),
  );
  const byDay = DAYS.map((day) => ({ day, messages: 0 }));
  const byHour = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    messages: 0,
  }));
  const month = monthKey(new Date());
  const monthBuilders = new Set<string>();
  let monthUpdates = 0;

  for (const r of rows) {
    const date = localDate(r.created_at);
    byDay[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7].messages++;
    byHour[Number(hourFmt.format(new Date(r.created_at))) % 24].messages++;
    if (!isUpdate(r)) continue;
    const w = perWeek.get(weekKey(r.created_at));
    if (w) {
      w.updates++;
      w.builders.add(r.member_id);
    }
    if (monthKey(r.created_at) === month) {
      monthUpdates++;
      monthBuilders.add(r.member_id);
    }
  }

  const [{ count: shipped }, { count: rankable }] = await Promise.all([
    supabase
      .from("shipped_approvals")
      .select("*", { count: "exact", head: true })
      .eq("status", "shipped"),
    supabase.from("ranked_members").select("*", { count: "exact", head: true }),
  ]);

  return {
    tiles: {
      monthUpdates,
      monthBuilders: monthBuilders.size,
      rankable: rankable ?? 0,
      shipped: shipped ?? 0,
    },
    weekly: weeks.map((w) => ({
      week: new Date(`${w}T12:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      updates: perWeek.get(w)!.updates,
      builders: perWeek.get(w)!.builders.size,
    })),
    byDay,
    byHour: byHour.map((h) => ({
      ...h,
      label:
        h.hour === 0
          ? "12a"
          : h.hour < 12
            ? `${h.hour}a`
            : h.hour === 12
              ? "12p"
              : `${h.hour - 12}p`,
    })),
    attendance: (events.data ?? []).map((e) => ({
      // Weekly meetings all share a name, so label bars by the meeting date.
      event: e.weekly ? dayLabel(e.date) : `${e.name} · ${dayLabel(e.date)}`,
      attended: (e.attendance as unknown as { count: number }[])[0]?.count ?? 0,
    })),
  };
}
