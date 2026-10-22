"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
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
