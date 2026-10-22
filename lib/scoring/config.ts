// Scoring weights, in one place so organizers can tune them (PLAN.md §5).

/** Points per item and monthly cap (null = uncapped). */
export const WEIGHTS = {
  /** progress_update (or an unapproved shipped candidate) with substance ≥ minSubstance. */
  progressUpdate: { points: 10, cap: 80, minSubstance: 2 },
  /** Exec-approved shipped post, once per member per project. */
  shipped: { points: 25, cap: 75 },
  helpGiven: { points: 5, cap: 25 },
  /** Likes received on progress/shipped posts (self-likes don't count). */
  likesReceived: { points: 1, cap: 30 },
  /** Per event attended, multiplied by the event's weight. */
  eventAttended: { points: 15, cap: null },
  githubActiveDay: { points: 3, cap: 60 },
  githubMergedPr: { points: 5, cap: 40 },
  /**
   * Each week with an update whose previous week also had one. An "update" is
   * a progress or shipped post with substance ≥ minSubstance.
   */
  streakWeek: { points: 5, cap: 30, minSubstance: 1 },
} as const;

export const BONUS = {
  /** Default points for demoing at an event. Admins can override per award. */
  demoPoints: 30,
} as const;

export const BADGES = {
  /** "Demo Day": demoed at this many different events. */
  demoDayMinDemos: 3,
} as const;

/** Months and weeks (Monday start) are counted in the club's local time. */
export const TIME_ZONE = "America/New_York";
