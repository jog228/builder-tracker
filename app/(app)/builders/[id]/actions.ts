"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import {
  checkCommunityAward,
  communityUsed,
  type CommunityAwardResult,
} from "@/lib/scoring/community";
import { scheduleRecompute } from "@/lib/scoring/recompute";
import { monthKey } from "@/lib/scoring/time";
import { canEditNowBuilding } from "@/lib/summaries/now-building";
import { createClient } from "@/lib/supabase/server";

export type OverrideResult =
  { ok: true } | { ok: false; status: 400 | 403; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The profile's owner writes their own "Now Building" text (stored as an
 * override; who and when are stamped by the database), or passes null /
 * blank to reset to the auto-summary. Anyone else, admins included, gets a
 * 403. Writes with the owner's session, so RLS ("owners override") applies.
 */
export async function saveNowBuilding(
  memberId: string,
  text: string | null,
): Promise<OverrideResult> {
  const viewer = await getViewer();
  if (!UUID.test(memberId) || !canEditNowBuilding(viewer, memberId))
    return {
      ok: false,
      status: 403,
      error: "Only you can edit your own Now Building.",
    };
  const override = text?.replace(/\s+/g, " ").trim() || null;
  if (override && override.length > 400)
    return { ok: false, status: 400, error: "Keep it under 400 characters." };

  const supabase = await createClient();
  const table = () => supabase.from("member_summaries");
  // Update the owner's row; if they don't have one yet (no auto-summary),
  // create it with just the override. (Not an upsert: ON CONFLICT DO UPDATE
  // would need update rights on member_id, which owners don't have.)
  const updated = await table()
    .update({
      override_summary: override,
      override_by: override ? viewer!.memberId : null,
    })
    .eq("member_id", memberId)
    .select("member_id");
  let error = updated.error;
  if (!error && !updated.data?.length && override)
    ({ error } = await table().insert({
      member_id: memberId,
      override_summary: override,
      override_by: viewer!.memberId,
    }));
  if (error) return { ok: false, status: 400, error: error.message };
  revalidatePath(`/builders/${memberId}`);
  return { ok: true };
}

// ─── Community points (admins only) ─────────────────────────────────────────

/**
 * Awards +5 / +10 community points with a reason. Admins only (403
 * otherwise), never to yourself or an exec board member, within the monthly
 * cap. Writes with the admin's session (RLS "admins award", the cap trigger
 * and the exec trigger apply too), then recomputes scores.
 */
export async function awardCommunityPoints(
  memberId: string,
  amount: number,
  reason: string,
  otherText: string | null = null,
): Promise<CommunityAwardResult> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin)
    return checkCommunityAward(null, null, { amount, reason }, 0);
  if (viewer.memberId === memberId)
    return {
      ok: false,
      status: 403,
      error: "You can't award points to yourself.",
    };
  if (!UUID.test(memberId))
    return { ok: false, status: 400, error: "Bad request." };

  const supabase = await createClient();
  const [{ data: target }, { data: bonuses, error: loadError }] =
    await Promise.all([
      supabase
        .from("members")
        .select("id, active, exclude_from_rankings")
        .eq("id", memberId)
        .maybeSingle(),
      supabase
        .from("bonus_points")
        .select("type, points, awarded_at, revoked_at")
        .eq("member_id", memberId)
        .eq("type", "community"),
    ]);
  if (loadError) return { ok: false, status: 400, error: loadError.message };

  const check = checkCommunityAward(
    viewer,
    target,
    { amount, reason, otherText },
    communityUsed(bonuses ?? [], monthKey(new Date())),
  );
  if (!check.ok) return check;

  const { error } = await supabase.from("bonus_points").insert({
    member_id: memberId,
    type: "community",
    points: check.points,
    reason: check.reason,
    awarded_by: viewer.memberId,
  });
  if (error)
    return error.code === "23514"
      ? {
          ok: false,
          status: 409,
          error:
            "That would pass the monthly cap or isn't allowed for this member.",
        }
      : { ok: false, status: 400, error: error.message };

  scheduleRecompute();
  revalidatePath(`/builders/${memberId}`);
  return check;
}

/** Undoes a community award (soft revoke recording who). Admins only. */
export async function undoCommunityPoints(
  bonusId: string,
): Promise<
  { ok: true } | { ok: false; status: 400 | 403 | 404; error: string }
> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin)
    return {
      ok: false,
      status: 403,
      error: "Only exec board admins can undo awards.",
    };
  if (!UUID.test(bonusId))
    return { ok: false, status: 400, error: "Bad request." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bonus_points")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: viewer.memberId,
    })
    .eq("id", bonusId)
    .eq("type", "community")
    .is("revoked_at", null)
    .select("member_id");
  if (error) return { ok: false, status: 400, error: error.message };
  if (!data.length)
    return {
      ok: false,
      status: 404,
      error: "That award doesn't exist or was already undone.",
    };

  scheduleRecompute();
  revalidatePath(`/builders/${data[0].member_id}`);
  return { ok: true };
}
