// What a single update earns and whether it keeps a streak alive. Pure; the
// one place these rules live, used by scoring (compute.ts) and the profile.
import { STREAK_MIN_SUBSTANCE, UPDATE_MIN_SUBSTANCE, WEIGHTS } from "./config";

/** Takes the effective category (after any exec shipped decision). */
type Post = { category: string; substance: number };

/** Progress or shipped posts are "updates"; help and chatter aren't. */
export const isUpdate = ({ category }: Pick<Post, "category">) =>
  category === "progress_update" || category === "shipped";

/** Any real progress update (substance ≥ UPDATE_MIN_SUBSTANCE) earns points. */
export const earnsProgressPoints = (p: Post) =>
  p.category === "progress_update" && p.substance >= UPDATE_MIN_SUBSTANCE;

/** A detailed update (substance ≥ STREAK_MIN_SUBSTANCE) counts for its week's streak. */
export const countsForStreak = (p: Post) =>
  isUpdate(p) && p.substance >= STREAK_MIN_SUBSTANCE;

/**
 * Points for one post (for shipped, before the once-per-project rule): what
 * the profile shows next to an update.
 */
export function updatePoints(p: Post): number {
  if (p.category === "shipped") return WEIGHTS.shipped.points;
  if (p.category === "help_given") return WEIGHTS.helpGiven.points;
  return earnsProgressPoints(p) ? WEIGHTS.progressUpdate.points : 0;
}
