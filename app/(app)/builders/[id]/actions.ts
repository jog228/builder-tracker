"use server";

import { revalidatePath } from "next/cache";
import { FORBIDDEN, getAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type OverrideResult =
  { ok: true } | { ok: false; status: 400 | 403 | 404; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admins edit a member's "Now Building" text (stored as an override with who
 * and when), or pass null / blank to go back to the generated summary.
 * Members get a 403. Writes with the admin's session, so RLS applies too.
 */
export async function saveNowBuilding(
  memberId: string,
  text: string | null,
): Promise<OverrideResult> {
  const viewer = await getAdmin();
  if (!viewer) return FORBIDDEN;
  if (!UUID.test(memberId))
    return { ok: false, status: 400, error: "Bad request." };
  const override = text?.replace(/\s+/g, " ").trim() || null;
  if (override && override.length > 400)
    return { ok: false, status: 400, error: "Keep it under 400 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member_summaries")
    .update({
      override_summary: override,
      override_by: override ? viewer.memberId : null,
    })
    .eq("member_id", memberId)
    .select("member_id");
  if (error) return { ok: false, status: 400, error: error.message };
  if (!data.length)
    return {
      ok: false,
      status: 404,
      error:
        "There's no summary to edit yet. It appears after their first scored update.",
    };
  revalidatePath(`/builders/${memberId}`);
  return { ok: true };
}
