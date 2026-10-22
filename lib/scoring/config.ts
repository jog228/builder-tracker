// Scoring weights, in one place so organizers can tune them (PLAN.md §5).

/**
 * Claude rates each post's substance 0–3. Any real update (≥ 1) earns
 * progress points; a detailed one (≥ 2: what you built, results, what's next)
 * is needed for that week to count toward a streak. 0 and chatter earn nothing.
 */
export const UPDATE_MIN_SUBSTANCE = 1;
export const STREAK_MIN_SUBSTANCE = 2;

/** Points per item and monthly cap (null = uncapped). */
export const WEIGHTS = {
  /** progress_update (or an unapproved shipped candidate) with substance ≥ minSubstance. */
  progressUpdate: { points: 10, cap: 80, minSubstance: UPDATE_MIN_SUBSTANCE },
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
   * Each week with a streak update whose previous week also had one. A
   * "streak update" is a progress or shipped post with substance ≥
   * minSubstance; the same rule drives the streak shown on profiles and the
   * leaderboard and (Phase 6) the streak badge. See countsForStreak().
   */
  streakWeek: { points: 5, cap: 30, minSubstance: STREAK_MIN_SUBSTANCE },
} as const;

export const BONUS = {
  /** Default points for demoing at an event. Admins can override per award. */
  demoPoints: 30,
  /**
   * Community help: small tasks (an Instagram feature, helping at an event),
   * awarded by admins from a profile. Only these amounts (the database
   * enforces the same); no monthly cap.
   */
  community: {
    amounts: [5, 10] as const,
    reasons: ["Instagram feature", "Helped at event"] as const,
  },
} as const;

export const BADGES = {
  /** "Demo Day": demoed at this many different events. */
  demoDayMinDemos: 3,
  /**
   * "Never Misses", earned per month: attended 100% of that month's held
   * weekly meetings (lib/attendance/meetings.ts), with at least this many
   * held so a single meeting doesn't count.
   */
  neverMisses: {
    slug: "never-misses",
    minMeetings: 2,
    description: "100% attendance for the month.",
  },
} as const;

/** Months and weeks (Monday start) are counted in the club's local time. */
export const TIME_ZONE = "America/New_York";

/**
 * The one recurring event (Phase 3). /admin/checkin creates it for a week the
 * first time an admin opens that week. Attending earns
 * WEIGHTS.eventAttended.points × weight.
 */
export const WEEKLY_MEETING = {
  name: "Weekly Meeting",
  /** ISO weekday, Monday = 1 … Sunday = 7. Thursday, per the GroupMe announcements. */
  weekday: 4,
  /** Start time in TIME_ZONE, 24-hour "HH:MM". */
  time: "16:30",
  weight: 1,
} as const;

/**
 * First day of the attendance season (club time). The check-in week picker
 * starts at the first meeting on or after this date ("Kickoff") and never
 * offers, creates or accepts check-ins for an earlier meeting.
 */
export const SEASON_START = "2026-10-01";

/**
 * Builder of the Month (Phase 6): at month end the exec board picks the winner
 * from this many top-ranked builders on the monthly leaderboard.
 */
export const BUILDER_OF_THE_MONTH = { finalists: 5 } as const;

/** GitHub points (Phase 5) start counting once members can link accounts. */
export const GITHUB = { enabled: false } as const;
