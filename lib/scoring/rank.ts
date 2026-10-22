import { isRankable, type EligibilityFields } from "./eligibility";

export type RankInput = EligibilityFields & { id: string };
export type RankedMember = { memberId: string; total: number; rank: number };

/**
 * Orders rankable members by total score, highest first. Ties share a rank
 * (1, 2, 2, 4). Excluded or inactive members are dropped even if they have a
 * total, and members with no total score 0.
 */
export function rankMembers(
  members: RankInput[],
  totals: ReadonlyMap<string, number>,
): RankedMember[] {
  const sorted = members
    .filter(isRankable)
    .map((m) => ({ memberId: m.id, total: totals.get(m.id) ?? 0 }))
    .sort((a, b) => b.total - a.total || a.memberId.localeCompare(b.memberId));

  const ranked: RankedMember[] = [];
  sorted.forEach((entry, i) => {
    const prev = ranked[i - 1];
    const rank = prev && prev.total === entry.total ? prev.rank : i + 1;
    ranked.push({ ...entry, rank });
  });
  return ranked;
}
