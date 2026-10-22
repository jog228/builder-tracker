// Loads everything scoring needs, computes snapshots, and saves them.
// Used by the compute-scores cron route, its script, and admin actions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { awardBadges } from "../badges/award";
import { fetchAll, one } from "../supabase/fetch-all";
import type { BonusRow } from "./bonus";
import {
  computeScores,
  type AttendanceRow,
  type GithubRow,
  type ScoredMessage,
  type ScoringMember,
} from "./compute";
import { buildAliasMap, type ProjectAlias } from "./projects";
import type { ApprovalStatus } from "./shipped";
import { localDate, monthKey } from "./time";

type MemberRow = {
  id: string;
  display_name: string;
  active: boolean;
  exclude_from_rankings: boolean;
  member_identities:
    | { groupme_user_id: string | null }
    | { groupme_user_id: string | null }[]
    | null;
};

type ScoreRow = {
  category: string;
  substance: number;
  project: string | null;
  message_id: string;
  messages:
    | { member_id: string | null; created_at: string; liked_by: string[] }
    | { member_id: string | null; created_at: string; liked_by: string[] }[];
};

async function loadInput(db: SupabaseClient) {
  const [
    members,
    scores,
    approvals,
    attendance,
    github,
    bonuses,
    events,
    aliases,
  ] = await Promise.all([
    fetchAll<MemberRow>((f, t) =>
      db
        .from("members")
        .select(
          "id, display_name, active, exclude_from_rankings, member_identities(groupme_user_id)",
        )
        .range(f, t),
    ),
    fetchAll<ScoreRow>((f, t) =>
      db
        .from("message_scores")
        .select(
          "category, substance, project, message_id, messages!inner(member_id, created_at, liked_by)",
        )
        .range(f, t),
    ),
    fetchAll<{ message_id: string; status: ApprovalStatus }>((f, t) =>
      db.from("shipped_approvals").select("message_id, status").range(f, t),
    ),
    fetchAll<{
      member_id: string;
      events:
        { date: string; weight: number } | { date: string; weight: number }[];
    }>((f, t) =>
      db
        .from("attendance")
        .select("member_id, events!inner(date, weight)")
        .range(f, t),
    ),
    fetchAll<GithubRow>((f, t) =>
      db
        .from("github_activity")
        .select("member_id, date, commits, prs_merged")
        .range(f, t),
    ),
    fetchAll<
      Omit<BonusRow, "event_date"> & {
        events: { date: string } | { date: string }[] | null;
      }
    >((f, t) =>
      db
        .from("bonus_points")
        .select(
          "id, member_id, event_id, type, points, reason, awarded_at, awarded_by, revoked_at, events(date)",
        )
        .range(f, t),
    ),
    fetchAll<{ id: string; name: string }>((f, t) =>
      db.from("events").select("id, name").range(f, t),
    ),
    fetchAll<ProjectAlias>((f, t) =>
      db
        .from("project_aliases")
        .select("member_id, alias, canonical")
        .range(f, t),
    ),
  ]);

  const approvalByMessage = new Map(
    approvals.map((a) => [a.message_id, a.status]),
  );

  return {
    members: members.map<ScoringMember>((m) => ({
      id: m.id,
      active: m.active,
      exclude_from_rankings: m.exclude_from_rankings,
      groupmeUserId: one(m.member_identities)?.groupme_user_id ?? null,
    })),
    messages: scores.flatMap<ScoredMessage>((s) => {
      const msg = one(s.messages);
      if (!msg?.member_id) return [];
      return [
        {
          member_id: msg.member_id,
          created_at: msg.created_at,
          category: s.category,
          approval: approvalByMessage.get(s.message_id) ?? null,
          substance: s.substance,
          project: s.project,
          liked_by: msg.liked_by ?? [],
        },
      ];
    }),
    attendance: attendance.flatMap<AttendanceRow>((a) => {
      const ev = one(a.events);
      return ev
        ? [{ member_id: a.member_id, date: ev.date, weight: Number(ev.weight) }]
        : [];
    }),
    github,
    // Each bonus carries its event's date, so it scores in the meeting's month.
    bonuses: bonuses.map<BonusRow>(({ events: ev, ...b }) => ({
      ...b,
      event_date: one(ev)?.date ?? null,
    })),
    eventNames: new Map(events.map((e) => [e.id, e.name])),
    memberNames: new Map(members.map((m) => [m.id, m.display_name])),
    aliases: buildAliasMap(aliases),
  };
}

export type ComputeResult = { runId: number; snapshots: number; month: string };

/**
 * Recomputes the current month and all-time snapshots. Keeps the rank from the
 * last computation on an earlier day as prev_rank, so ▲▼ shows daily movement.
 */
export async function computeAndSaveScores(
  db: SupabaseClient,
  now = new Date(),
): Promise<ComputeResult> {
  const { data: run, error: runError } = await db
    .from("sync_runs")
    .insert({ source: "compute-scores" })
    .select("id")
    .single();
  if (runError) throw runError;

  try {
    const snapshots = computeScores(await loadInput(db), now);
    const month = monthKey(now);
    const today = localDate(now);

    const { data: existing, error } = await db
      .from("score_snapshots")
      .select("member_id, period, rank, computed_at, prev_rank, prev_rank_on")
      .in("period", [month, "all"]);
    if (error) throw error;
    const before = new Map(
      existing.map((e) => [`${e.member_id}::${e.period}`, e]),
    );

    const rows = snapshots.map((s) => {
      const old = before.get(`${s.member_id}::${s.period}`);
      const carry = old && localDate(old.computed_at) === today;
      return {
        member_id: s.member_id,
        period: s.period,
        components: s.components,
        total: s.total,
        rank: s.rank,
        computed_at: now.toISOString(),
        prev_rank: carry ? old.prev_rank : (old?.rank ?? null),
        prev_rank_on: carry
          ? old.prev_rank_on
          : old
            ? localDate(old.computed_at)
            : null,
      };
    });

    if (rows.length) {
      const { error: upsertError } = await db
        .from("score_snapshots")
        .upsert(rows, { onConflict: "member_id,period" });
      if (upsertError) throw upsertError;
    }

    // Drop snapshots for anyone no longer rankable (e.g. made inactive).
    const keep = new Set(rows.map((r) => `${r.member_id}::${r.period}`));
    const stale = existing.filter(
      (e) => !keep.has(`${e.member_id}::${e.period}`),
    );
    for (const s of stale) {
      await db
        .from("score_snapshots")
        .delete()
        .eq("member_id", s.member_id)
        .eq("period", s.period);
    }

    // Badges are earned from the same data (attendance, meetings), right after.
    const badges = await awardBadges(db, now);

    await db
      .from("sync_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        stats: { snapshots: rows.length, month, removed: stale.length, badges },
      })
      .eq("id", run.id);
    return { runId: run.id, snapshots: rows.length, month };
  } catch (err) {
    await db
      .from("sync_runs")
      .update({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    throw err;
  }
}
