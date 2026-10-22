// Awards badges after scores are computed (the start of the Phase 6 engine).
// Only Never Misses for now; the others show "coming soon". Syncs
// member_badges both ways: newly earned months are added, months no longer
// earned (e.g. a missed later meeting) are removed. Secret-key client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingEvent } from "@/lib/attendance/meetings";
import { BADGES } from "@/lib/scoring/config";
import { localDate } from "@/lib/scoring/time";
import { fetchAll, one } from "@/lib/supabase/fetch-all";
import { neverMissesMonths } from "./never-misses";

export type BadgeRunStats = {
  neverMisses: { earned: number; removed: number; held: number };
};

type AttendanceRow = {
  member_id: string;
  events:
    { date: string; weekly: boolean } | { date: string; weekly: boolean }[];
};

export async function awardBadges(
  db: SupabaseClient,
  now = new Date(),
): Promise<BadgeRunStats> {
  const today = localDate(now);
  const [{ data: badge, error }, members, meetings, attendance, existing] =
    await Promise.all([
      db
        .from("badges")
        .select("id")
        .eq("slug", BADGES.neverMisses.slug)
        .single(),
      fetchAll<{ id: string; active: boolean; exclude_from_rankings: boolean }>(
        (f, t) =>
          db
            .from("members")
            .select("id, active, exclude_from_rankings")
            .range(f, t),
      ),
      fetchAll<MeetingEvent>((f, t) =>
        db.from("events").select("date, weekly").eq("weekly", true).range(f, t),
      ),
      fetchAll<AttendanceRow>((f, t) =>
        db
          .from("attendance")
          .select("member_id, events!inner(date, weekly)")
          .range(f, t),
      ),
      fetchAll<{ member_id: string; period: string; badge_id: string }>(
        (f, t) =>
          db
            .from("member_badges")
            .select("member_id, period, badge_id")
            .range(f, t),
      ),
    ]);
  if (error) throw error;

  const attended = new Map<string, string[]>();
  for (const a of attendance) {
    const ev = one(a.events);
    if (!ev?.weekly) continue;
    attended.set(a.member_id, [...(attended.get(a.member_id) ?? []), ev.date]);
  }

  const want = new Set<string>();
  for (const m of members)
    for (const month of neverMissesMonths(
      m,
      meetings,
      attended.get(m.id) ?? [],
      today,
    ))
      want.add(`${m.id}::${month}`);

  const have = new Set(
    existing
      .filter((e) => e.badge_id === badge.id)
      .map((e) => `${e.member_id}::${e.period}`),
  );
  const add = [...want].filter((k) => !have.has(k));
  const remove = [...have].filter((k) => !want.has(k));

  if (add.length) {
    const { error: insertError } = await db.from("member_badges").insert(
      add.map((k) => {
        const [member_id, period] = k.split("::");
        return { member_id, badge_id: badge.id, period };
      }),
    );
    if (insertError) throw insertError;
  }
  for (const k of remove) {
    const [member_id, period] = k.split("::");
    const { error: deleteError } = await db
      .from("member_badges")
      .delete()
      .eq("member_id", member_id)
      .eq("badge_id", badge.id)
      .eq("period", period);
    if (deleteError) throw deleteError;
  }
  return {
    neverMisses: {
      earned: add.length,
      removed: remove.length,
      held: want.size,
    },
  };
}
