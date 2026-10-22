// Who may be scored, ranked, badged, awarded or counted in group stats.
// Exec board members (exclude_from_rankings) are ingested but never counted.

export type EligibilityFields = {
  active: boolean;
  exclude_from_rankings: boolean;
};

export function isRankable(member: EligibilityFields): boolean {
  return member.active && !member.exclude_from_rankings;
}
