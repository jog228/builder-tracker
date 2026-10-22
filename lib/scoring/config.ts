// Scoring weights, in one place so organizers can tune them (PLAN.md §5).
// Phase 4 adds the per-component weights and caps from the scoring table.

export const BONUS = {
  /** Default points for demoing at an event. Admins can override per award. */
  demoPoints: 30,
} as const;

export const BADGES = {
  /** "Demo Day": demoed at this many different events. */
  demoDayMinDemos: 3,
} as const;
