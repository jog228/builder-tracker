// Score computation (PLAN.md §5). Pure: takes everything as input, returns one
// snapshot per rankable member for the current month and for all time.
// Monthly caps apply per month; all-time is the sum of capped months.
import {
  bonusComponent,
  bonusDate,
  countableBonuses,
  type BonusLine,
  type BonusRow,
} from "./bonus";
import { WEIGHTS } from "./config";
import { isRankable, type EligibilityFields } from "./eligibility";
import { type AliasMap } from "./projects";
import { rankMembers } from "./rank";
import {
  countableShipped,
  effectiveCategory,
  type ApprovalStatus,
} from "./shipped";
import { monthKey, prevWeek, weekKey } from "./time";

export type ScoringMember = EligibilityFields & {
  id: string;
  groupmeUserId: string | null;
};

export type ScoredMessage = {
  member_id: string;
  created_at: string;
  category: string; // as classified
  approval: ApprovalStatus | null;
  substance: number;
  project: string | null;
  liked_by: string[]; // GroupMe user ids
};

export type AttendanceRow = { member_id: string; date: string; weight: number };
export type GithubRow = {
  member_id: string;
  date: string;
  commits: number;
  prs_merged: number;
};

export type ScoringInput = {
  members: ScoringMember[];
  messages: ScoredMessage[];
  attendance: AttendanceRow[];
  github: GithubRow[];
  bonuses: BonusRow[];
  eventNames: ReadonlyMap<string, string>;
  aliases: AliasMap;
};

export type Component = { count: number; points: number; cap: number | null };

export type Breakdown = {
  progress: Component;
  shipped: Component;
  help: Component;
  likes: Component;
  events: Component;
  githubDays: Component;
  githubPrs: Component;
  streak: Component;
  bonus: Component & { lines: BonusLine[] };
};

export const COMPONENT_LABELS: Record<keyof Breakdown, string> = {
  progress: "Progress updates",
  shipped: "Shipped",
  help: "Helping others",
  likes: "Likes received",
  events: "Events attended",
  githubDays: "GitHub active days",
  githubPrs: "GitHub merged PRs",
  streak: "Streak bonus",
  bonus: "Bonus points",
};

export type Streak = { current: number; longest: number };

export type Snapshot = {
  member_id: string;
  period: string; // "YYYY-MM" or "all"
  total: number;
  rank: number;
  components: Breakdown & { streak_weeks: Streak };
};

// Raw per-month tallies before weights and caps.
type Tally = {
  progress: number;
  shipped: number;
  help: number;
  likes: number;
  eventCount: number;
  eventPoints: number;
  githubDays: number;
  githubPrs: number;
  streakWeeks: number;
  bonus: BonusRow[];
};

const emptyTally = (): Tally => ({
  progress: 0,
  shipped: 0,
  help: 0,
  likes: 0,
  eventCount: 0,
  eventPoints: 0,
  githubDays: 0,
  githubPrs: 0,
  streakWeeks: 0,
  bonus: [],
});

const capped = (count: number, w: { points: number; cap: number | null }) => {
  const raw = count * w.points;
  return w.cap === null ? raw : Math.min(raw, w.cap);
};

function monthBreakdown(
  t: Tally,
  eventNames: ReadonlyMap<string, string>,
): Breakdown {
  const bonus = bonusComponent(t.bonus, eventNames);
  return {
    progress: {
      count: t.progress,
      points: capped(t.progress, WEIGHTS.progressUpdate),
      cap: WEIGHTS.progressUpdate.cap,
    },
    shipped: {
      count: t.shipped,
      points: capped(t.shipped, WEIGHTS.shipped),
      cap: WEIGHTS.shipped.cap,
    },
    help: {
      count: t.help,
      points: capped(t.help, WEIGHTS.helpGiven),
      cap: WEIGHTS.helpGiven.cap,
    },
    likes: {
      count: t.likes,
      points: capped(t.likes, WEIGHTS.likesReceived),
      cap: WEIGHTS.likesReceived.cap,
    },
    events: { count: t.eventCount, points: t.eventPoints, cap: null },
    githubDays: {
      count: t.githubDays,
      points: capped(t.githubDays, WEIGHTS.githubActiveDay),
      cap: WEIGHTS.githubActiveDay.cap,
    },
    githubPrs: {
      count: t.githubPrs,
      points: capped(t.githubPrs, WEIGHTS.githubMergedPr),
      cap: WEIGHTS.githubMergedPr.cap,
    },
    streak: {
      count: t.streakWeeks,
      points: capped(t.streakWeeks, WEIGHTS.streakWeek),
      cap: WEIGHTS.streakWeek.cap,
    },
    bonus: {
      count: t.bonus.length,
      points: bonus.total,
      cap: null,
      lines: bonus.lines,
    },
  };
}

const COMPONENT_KEYS = Object.keys(COMPONENT_LABELS) as (keyof Breakdown)[];

/** Sums monthly breakdowns (each already capped) into an all-time breakdown. */
function sumBreakdowns(months: Breakdown[]): Breakdown {
  const total = monthBreakdown(emptyTally(), new Map());
  for (const m of months) {
    for (const k of COMPONENT_KEYS) {
      total[k].count += m[k].count;
      total[k].points += m[k].points;
      total[k].cap = null; // caps are per month
    }
    total.bonus.lines.push(...m.bonus.lines);
  }
  return total;
}

const breakdownTotal = (b: Breakdown) =>
  COMPONENT_KEYS.reduce((sum, k) => sum + b[k].points, 0);

const nextWeek = (w: string) =>
  new Date(Date.parse(`${w}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** Current and longest run of consecutive weeks with an update. */
export function streakOf(weeks: Set<string>, now: Date): Streak {
  let longest = 0;
  for (const w of weeks) {
    if (weeks.has(prevWeek(w))) continue; // not the start of a run
    let len = 0;
    for (let x = w; weeks.has(x); x = nextWeek(x)) len++;
    longest = Math.max(longest, len);
  }
  // A streak stays alive through the current week until it ends without a post.
  let x = weekKey(now);
  if (!weeks.has(x)) x = prevWeek(x);
  let current = 0;
  for (; weeks.has(x); x = prevWeek(x)) current++;
  return { current, longest };
}

export function computeScores(input: ScoringInput, now: Date): Snapshot[] {
  const rankable = input.members.filter(isRankable);
  const memberById = new Map(input.members.map((m) => [m.id, m]));
  const rankableIds = new Set(rankable.map((m) => m.id));
  const tallies = new Map<string, Map<string, Tally>>(); // member → month → tally
  const updateWeeks = new Map<string, Set<string>>();

  const tally = (memberId: string, month: string) => {
    const byMonth = tallies.get(memberId) ?? new Map<string, Tally>();
    tallies.set(memberId, byMonth);
    const t = byMonth.get(month) ?? emptyTally();
    byMonth.set(month, t);
    return t;
  };

  const messages = input.messages
    .filter((m) => rankableIds.has(m.member_id))
    .map((m) => ({
      ...m,
      category: effectiveCategory(m.category, m.approval),
    }));

  for (const m of messages) {
    const t = tally(m.member_id, monthKey(m.created_at));
    const isUpdate =
      m.category === "progress_update" || m.category === "shipped";
    if (
      m.category === "progress_update" &&
      m.substance >= WEIGHTS.progressUpdate.minSubstance
    )
      t.progress++;
    if (m.category === "help_given") t.help++;
    if (isUpdate) {
      const self = memberById.get(m.member_id)?.groupmeUserId;
      t.likes += m.liked_by.filter((id) => id !== self).length;
      if (m.substance >= WEIGHTS.streakWeek.minSubstance) {
        const weeks = updateWeeks.get(m.member_id) ?? new Set<string>();
        weeks.add(weekKey(m.created_at));
        updateWeeks.set(m.member_id, weeks);
      }
    }
  }

  for (const s of countableShipped(messages, input.aliases)) {
    tally(s.member_id, monthKey(s.created_at)).shipped++;
  }

  for (const a of input.attendance) {
    if (!rankableIds.has(a.member_id)) continue;
    const t = tally(a.member_id, monthKey(a.date));
    t.eventCount++;
    t.eventPoints += WEIGHTS.eventAttended.points * a.weight;
  }

  for (const g of input.github) {
    if (!rankableIds.has(g.member_id)) continue;
    const t = tally(g.member_id, monthKey(g.date));
    if (g.commits > 0 || g.prs_merged > 0) t.githubDays++;
    t.githubPrs += g.prs_merged;
  }

  for (const b of countableBonuses(input.bonuses, memberById)) {
    // By the meeting's date, not when it was entered (back-filled demos).
    tally(b.member_id, monthKey(bonusDate(b))).bonus.push(b);
  }

  for (const [memberId, weeks] of updateWeeks) {
    for (const w of weeks) {
      if (weeks.has(prevWeek(w))) tally(memberId, monthKey(w)).streakWeeks++;
    }
  }

  // Breakdowns per member for the current month and all time.
  const currentMonth = monthKey(now);
  const periods: Record<string, Map<string, Breakdown>> = {
    [currentMonth]: new Map(),
    all: new Map(),
  };
  for (const m of rankable) {
    const months = [
      ...(tallies.get(m.id) ?? new Map<string, Tally>()).entries(),
    ]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, t]) => ({
        month,
        breakdown: monthBreakdown(t, input.eventNames),
      }));
    periods[currentMonth].set(
      m.id,
      months.find((x) => x.month === currentMonth)?.breakdown ??
        monthBreakdown(emptyTally(), input.eventNames),
    );
    periods.all.set(m.id, sumBreakdowns(months.map((x) => x.breakdown)));
  }

  const snapshots: Snapshot[] = [];
  for (const [period, breakdowns] of Object.entries(periods)) {
    const totals = new Map(
      [...breakdowns].map(([id, b]) => [id, breakdownTotal(b)]),
    );
    for (const r of rankMembers(rankable, totals)) {
      snapshots.push({
        member_id: r.memberId,
        period,
        total: r.total,
        rank: r.rank,
        components: {
          ...breakdowns.get(r.memberId)!,
          streak_weeks: streakOf(updateWeeks.get(r.memberId) ?? new Set(), now),
        },
      });
    }
  }
  return snapshots;
}
