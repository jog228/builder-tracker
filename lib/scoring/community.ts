// Community help points: who may award them, which amounts and reasons, and
// the monthly cap. Pure; the profile's server action applies it before
// writing (and RLS + database constraints apply it again).
import { BONUS } from "./config";
import { isRankable, type EligibilityFields } from "./eligibility";
import { monthKey } from "./time";

const C = BONUS.community;
export const OTHER_REASON = "Other";
const MAX_REASON = 120;

export type CommunityAwardResult =
  | { ok: true; points: number; reason: string }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

/** Active community points a member got in `month` ("YYYY-MM", club time). */
export function communityUsed(
  bonuses: {
    type: string;
    points: number;
    awarded_at: string;
    revoked_at: string | null;
  }[],
  month: string,
): number {
  return bonuses
    .filter(
      (b) =>
        b.type === "community" &&
        !b.revoked_at &&
        monthKey(b.awarded_at) === month,
    )
    .reduce((sum, b) => sum + b.points, 0);
}

/**
 * Validates one award. Admins only, never to yourself (the panel is hidden
 * from the profile's owner), never to exec board or inactive members, only
 * the preset amounts, a required reason, and within the monthly cap.
 */
export function checkCommunityAward(
  viewer: { memberId: string; isAdmin: boolean } | null,
  target: ({ id: string } & EligibilityFields) | null,
  input: { amount: number; reason: string; otherText?: string | null },
  usedThisMonth: number,
): CommunityAwardResult {
  if (!viewer?.isAdmin)
    return {
      ok: false,
      status: 403,
      error: "Only exec board admins can award points.",
    };
  if (!target)
    return { ok: false, status: 404, error: "That member doesn't exist." };
  if (target.id === viewer.memberId)
    return {
      ok: false,
      status: 403,
      error: "You can't award points to yourself.",
    };
  if (!isRankable(target))
    return {
      ok: false,
      status: 409,
      error: "Exec board and inactive members can't receive points.",
    };
  if (!(C.amounts as readonly number[]).includes(input.amount))
    return {
      ok: false,
      status: 400,
      error: `Awards are +${C.amounts.join(" or +")}.`,
    };

  let reason: string;
  if ((C.reasons as readonly string[]).includes(input.reason))
    reason = input.reason;
  else if (input.reason === OTHER_REASON) {
    reason = (input.otherText ?? "").replace(/\s+/g, " ").trim();
    if (reason.length < 3)
      return { ok: false, status: 400, error: "Say what it was for." };
    if (reason.length > MAX_REASON)
      return {
        ok: false,
        status: 400,
        error: `Keep the reason under ${MAX_REASON} characters.`,
      };
  } else return { ok: false, status: 400, error: "Pick a reason." };

  if (usedThisMonth + input.amount > C.monthlyCap)
    return {
      ok: false,
      status: 409,
      error: `That would pass the ${C.monthlyCap}-point monthly cap (${usedThisMonth} used).`,
    };
  return { ok: true, points: input.amount, reason };
}
