// Manual bonus points (demos and "other"). Uncapped, shown as their own line in
// the score breakdown and on profiles with their reason.
import { BADGES } from "./config";
import { isRankable, type EligibilityFields } from "./eligibility";

export type BonusType = "demo" | "other";

export type BonusRow = {
  id: string;
  member_id: string;
  event_id: string | null;
  type: BonusType;
  points: number;
  reason: string;
  awarded_at: string;
  revoked_at: string | null;
};

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

export type BonusLine = { label: string; points: number; awardedAt: string };

/** One member's bonus line in the score breakdown. No cap. */
export function bonusComponent(
  countable: BonusRow[],
  eventNames: ReadonlyMap<string, string>,
): { total: number; lines: BonusLine[] } {
  const lines = countable.map((r) => ({
    label:
      r.type === "demo"
        ? `🎤 Demoed at ${eventNames.get(r.event_id ?? "") ?? "an event"}`
        : r.reason,
    points: r.points,
    awardedAt: r.awarded_at,
  }));
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
