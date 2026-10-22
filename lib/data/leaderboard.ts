import "server-only";
import type { Breakdown, Streak } from "@/lib/scoring/compute";
import { monthKey } from "@/lib/scoring/time";
import { fetchAll, one } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

export type Period = "month" | "all";
export const periodKey = (p: Period) =>
  p === "all" ? "all" : monthKey(new Date());

export type BadgeInfo = {
  slug: string;
  name: string;
  icon: string;
  description: string;
};

export type LeaderboardRow = {
  memberId: string;
  name: string;
  avatarUrl: string | null;
  rank: number;
  prevRank: number | null;
  total: number;
  streak: Streak;
  breakdown: Breakdown;
  badges: BadgeInfo[];
};

type SnapshotRow = {
  member_id: string;
  rank: number;
  prev_rank: number | null;
  total: number;
  computed_at: string;
  components: Breakdown & { streak_weeks: Streak };
  members:
    | { display_name: string; avatar_url: string | null }
    | { display_name: string; avatar_url: string | null }[];
};

/** Earned badges per member, each badge once (lib/badges/award.ts). */
export async function getEarnedBadges(): Promise<Map<string, BadgeInfo[]>> {
  const supabase = await createClient();
  const rows = await fetchAll<{
    member_id: string;
    badges: BadgeInfo | BadgeInfo[];
  }>((f, t) =>
    supabase
      .from("member_badges")
      .select("member_id, badges(slug, name, icon, description)")
      .range(f, t),
  );
  const byMember = new Map<string, BadgeInfo[]>();
  for (const r of rows) {
    const b = one(r.badges);
    // Per-month badges (Never Misses) can have several rows: show each once.
    const mine = byMember.get(r.member_id) ?? [];
    if (b && !mine.some((x) => x.slug === b.slug))
      byMember.set(r.member_id, [...mine, b]);
  }
  return byMember;
}

export async function getLeaderboard(period: Period) {
  const supabase = await createClient();
  const [snapshots, badges] = await Promise.all([
    fetchAll<SnapshotRow>((f, t) =>
      supabase
        .from("score_snapshots")
        .select(
          "member_id, rank, prev_rank, total, computed_at, components, members(display_name, avatar_url)",
        )
        .eq("period", periodKey(period))
        .order("rank")
        .range(f, t),
    ),
    getEarnedBadges(),
  ]);

  const rows: LeaderboardRow[] = snapshots.map((s) => {
    const m = one(s.members);
    return {
      memberId: s.member_id,
      name: m?.display_name ?? "Unknown",
      avatarUrl: m?.avatar_url ?? null,
      rank: s.rank,
      prevRank: s.prev_rank,
      total: Number(s.total),
      streak: s.components.streak_weeks,
      breakdown: s.components,
      badges: badges.get(s.member_id) ?? [],
    };
  });
  const updatedAt = snapshots.reduce<string | null>(
    (latest, s) => (!latest || s.computed_at > latest ? s.computed_at : latest),
    null,
  );
  return { rows, updatedAt, periodKey: periodKey(period) };
}
