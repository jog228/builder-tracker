// Manual bonus points (demos and "other"). Uncapped, shown as their own line in
// the score breakdown and on profiles with their reason.
import { BADGES, BONUS } from "./config";
import { isRankable, type EligibilityFields } from "./eligibility";

export type BonusType = "demo" | "other" | "community";

export type BonusRow = {
  id: string;
  member_id: string;
  event_id: string | null;
  type: BonusType;
  points: number;
  reason: string;
  awarded_at: string;
  revoked_at: string | null;
  /** The linked event's date ("YYYY-MM-DD"), when there is one. */
  event_date?: string | null;
  /** Member id of the admin who awarded it. */
  awarded_by?: string | null;
};

/**
 * The date a bonus belongs to: its event's date (a demo entered later for a
 * past meeting still belongs to that meeting), else when it was awarded.
 */
export const bonusDate = (r: Pick<BonusRow, "event_date" | "awarded_at">) =>
  r.event_date ?? r.awarded_at;

/**
 * The awards that count: not revoked, for rankable members only, and at most
 * one demo per member per event (the earliest). The database enforces the same
 * rules; this keeps scoring correct even if bad rows slip in.
 */
export function countableBonuses<T extends BonusRow>(
  rows: T[],
  members: ReadonlyMap<string, EligibilityFields>,
): T[] {
  const seenDemos = new Set<string>();
  return rows
    .filter((r) => {
      const member = members.get(r.member_id);
      return !r.revoked_at && member !== undefined && isRankable(member);
    })
    .sort((a, b) => a.awarded_at.localeCompare(b.awarded_at))
    .filter((r) => {
      if (r.type !== "demo") return true;
      if (!r.event_id) return false;
      const key = `${r.member_id}::${r.event_id}`;
      if (seenDemos.has(key)) return false;
      seenDemos.add(key);
      return true;
    });
}

/** `type` lets the UI pick an icon; labels are plain text (no emoji). */
export type BonusLine = {
  type: BonusType;
  label: string;
  points: number;
  /** bonusDate(): the event's "YYYY-MM-DD", else the awarded_at timestamp. */
  date: string;
  awardedAt: string;
  /** Display name of the admin who awarded it, when known. */
  by?: string | null;
};

/** One member's bonus line in the score breakdown. No cap. */
/**
 * One member's bonus line for one month. Demo and "other" bonuses are
 * uncapped; community points count up to BONUS.community.monthlyCap (the
 * database refuses awards past it; this keeps scoring right regardless).
 */
export function bonusComponent(
  countable: BonusRow[],
  eventNames: ReadonlyMap<string, string>,
  memberNames: ReadonlyMap<string, string> = new Map(),
): { total: number; lines: BonusLine[] } {
  let communityLeft: number = BONUS.community.monthlyCap;
  const lines = [...countable]
    .sort((a, b) => a.awarded_at.localeCompare(b.awarded_at))
    .map((r) => {
      let points = r.points;
      if (r.type === "community") {
        points = Math.min(points, communityLeft);
        communityLeft -= points;
      }
      return {
        type: r.type,
        label:
          r.type === "demo"
            ? `Demoed at ${eventNames.get(r.event_id ?? "") ?? "an event"}`
            : r.reason,
        points,
        date: bonusDate(r),
        awardedAt: r.awarded_at,
        by: r.awarded_by ? (memberNames.get(r.awarded_by) ?? null) : null,
      };
    })
    .filter((l) => l.points > 0);
  return { total: lines.reduce((sum, l) => sum + l.points, 0), lines };
}

/** Number of different events a member has demoed at (from countable rows). */
export function demoCount(countable: BonusRow[], memberId: string): number {
  return new Set(
    countable
      .filter((r) => r.member_id === memberId && r.type === "demo")
      .map((r) => r.event_id),
  ).size;
}

export const earnsDemoDayBadge = (demos: number) =>
  demos >= BADGES.demoDayMinDemos;
