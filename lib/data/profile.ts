import "server-only";
import { bonusDate } from "@/lib/scoring/bonus";
import { countsForStreak, isUpdate, updatePoints } from "@/lib/scoring/updates";
import { getWeeklyMeetings } from "@/lib/data/meetings";
import { BADGES } from "@/lib/scoring/config";
import type { SummaryRow } from "@/lib/summaries/now-building";
import type { Breakdown, Streak } from "@/lib/scoring/compute";
import type { ApprovalStatus } from "@/lib/scoring/shipped";
import { effectiveCategory } from "@/lib/scoring/shipped";
import { monthKey } from "@/lib/scoring/time";
import { fetchAll, one } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { BadgeInfo } from "./leaderboard";

export type ProfileSnapshot = {
  rank: number;
  prevRank: number | null;
  total: number;
  of: number;
  breakdown: Breakdown & { streak_weeks: Streak };
};

export type RecentUpdate = {
  id: string;
  createdAt: string;
  text: string;
  channel: string;
  likes: number;
  category: string; // effective
  rawCategory: string;
  approval: ApprovalStatus | null;
  substance: number;
  /** Nominal points (updatePoints()): before caps / once-per-project. */
  points: number;
  /** Whether it keeps its week's streak alive; null for non-update posts. */
  streak: boolean | null;
  summary: string | null;
  project: string | null;
};

const HEATMAP_WEEKS = 18;

/** Badges with a rule that awards them; the rest show "coming soon". */
const LIVE_BADGES = new Set<string>([BADGES.neverMisses.slug]);

export async function getProfile(memberId: string) {
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("members")
    .select(
      "id, display_name, avatar_url, role, exclude_from_rankings, active, joined_at",
    )
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return null;

  const month = monthKey(new Date());
  const since = new Date(
    Date.now() - HEATMAP_WEEKS * 7 * 86_400_000,
  ).toISOString();

  const [
    snapshots,
    counts,
    catalog,
    earned,
    activity,
    updates,
    attendance,
    bonuses,
    meetings,
    summary,
  ] = await Promise.all([
    supabase
      .from("score_snapshots")
      .select("period, rank, prev_rank, total, components")
      .eq("member_id", memberId)
      .in("period", [month, "all"]),
    Promise.all(
      [month, "all"].map((p) =>
        supabase
          .from("score_snapshots")
          .select("*", { count: "exact", head: true })
          .eq("period", p),
      ),
    ),
    supabase
      .from("badges")
      .select("slug, name, icon, description")
      .order("name"),
    supabase
      .from("member_badges")
      .select("earned_at, period, badges(slug)")
      .eq("member_id", memberId),
    fetchAll<{ created_at: string }>((f, t) =>
      supabase
        .from("messages")
        .select("created_at")
        .eq("member_id", memberId)
        .eq("sender_type", "user")
        .gte("created_at", since)
        .range(f, t),
    ),
    supabase
      .from("messages")
      .select(
        "id, created_at, text, like_count, channel_name, message_scores!inner(category, substance, summary, project)",
      )
      .eq("member_id", memberId)
      .in("message_scores.category", [
        "progress_update",
        "shipped_candidate",
        "help_given",
      ])
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("attendance")
      .select("events(id, name, date, type, weekly)")
      .eq("member_id", memberId),
    supabase
      .from("bonus_points")
      .select("id, type, points, reason, awarded_at, events(name, date)")
      .eq("member_id", memberId)
      .is("revoked_at", null),
    getWeeklyMeetings(supabase),
    supabase
      .from("member_summaries")
      .select(
        "project, summary, update_count, last_post_at, generated_at, override_summary, override_at, editor:members!member_summaries_override_by_fkey(display_name)",
      )
      .eq("member_id", memberId)
      .maybeSingle(),
  ]);

  const snap = (period: string, i: number): ProfileSnapshot | null => {
    const s = snapshots.data?.find((x) => x.period === period);
    return s
      ? {
          rank: s.rank,
          prevRank: s.prev_rank,
          total: Number(s.total),
          of: counts[i].count ?? 0,
          breakdown: s.components,
        }
      : null;
  };

  const updateRows = updates.data ?? [];
  const { data: approvals } = updateRows.length
    ? await supabase
        .from("shipped_approvals")
        .select("message_id, status")
        .in(
          "message_id",
          updateRows.map((u) => u.id),
        )
    : { data: [] };
  const approvalBy = new Map(
    (approvals ?? []).map((a) => [a.message_id, a.status as ApprovalStatus]),
  );

  // Periods ("2026-10" or "all") each badge was earned in.
  const earnedPeriods = new Map<string, string[]>();
  for (const e of earned.data ?? []) {
    const slug = one(e.badges as { slug: string } | { slug: string }[])?.slug;
    if (slug)
      earnedPeriods.set(slug, [...(earnedPeriods.get(slug) ?? []), e.period]);
  }

  return {
    member,
    /** Weekly meetings, for the attendance rate (meetingsHeld()). */
    meetings,
    /** "Now Building" row (generated summary + any admin override), or null. */
    summary: summary.data
      ? ({
          project: summary.data.project,
          summary: summary.data.summary,
          update_count: summary.data.update_count,
          last_post_at: summary.data.last_post_at,
          generated_at: summary.data.generated_at,
          override_summary: summary.data.override_summary,
          override_at: summary.data.override_at,
          override_by_name:
            one(
              summary.data.editor as unknown as
                { display_name: string } | { display_name: string }[] | null,
            )?.display_name ?? null,
        } satisfies SummaryRow)
      : null,
    month: snap(month, 0),
    all: snap("all", 1),
    badges: (catalog.data ?? []).map((b: BadgeInfo) => {
      const periods = (earnedPeriods.get(b.slug) ?? []).sort();
      return {
        ...b,
        earned: periods.length > 0,
        /** Months earned, oldest first (per-month badges like Never Misses). */
        periods: periods.filter((p) => p !== "all"),
        /** No rule awards it yet (Phase 6). */
        comingSoon: !LIVE_BADGES.has(b.slug),
      };
    }),
    activity: activity.map((a) => a.created_at),
    heatmapWeeks: HEATMAP_WEEKS,
    updates: updateRows.map<RecentUpdate>((u) => {
      const s = one(
        u.message_scores as {
          category: string;
          substance: number;
          summary: string | null;
          project: string | null;
        }[],
      )!;
      const approval = approvalBy.get(u.id) ?? null;
      const post = {
        category: effectiveCategory(s.category, approval),
        substance: s.substance,
      };
      return {
        id: u.id,
        createdAt: u.created_at,
        text: u.text ?? "",
        channel: u.channel_name ?? "Main",
        likes: u.like_count,
        rawCategory: s.category,
        category: effectiveCategory(s.category, approval),
        approval,
        substance: s.substance,
        points: updatePoints(post),
        streak: isUpdate(post) ? countsForStreak(post) : null,
        summary: s.summary,
        project: s.project,
      };
    }),
    events: (attendance.data ?? [])
      .map((a) =>
        one(
          a.events as {
            id: string;
            name: string;
            date: string;
            type: string;
            weekly: boolean;
          }[],
        ),
      )
      .filter(
        (
          e,
        ): e is {
          id: string;
          name: string;
          date: string;
          type: string;
          weekly: boolean;
        } => !!e,
      )
      .sort((a, b) => b.date.localeCompare(a.date)),
    // Dated by their event (a demo entered later for a past meeting shows the
    // meeting's date); only bonuses without an event use awarded_at.
    bonuses: (bonuses.data ?? [])
      .map((b) => {
        const ev = one(b.events as { name: string; date: string }[]);
        return {
          id: b.id,
          type: b.type as "demo" | "other",
          points: b.points,
          reason: b.reason,
          awardedAt: b.awarded_at,
          eventName: ev?.name ?? null,
          date: bonusDate({ event_date: ev?.date, awarded_at: b.awarded_at }),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
}
