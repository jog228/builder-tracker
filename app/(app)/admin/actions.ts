"use server";

import { revalidatePath } from "next/cache";
import { FORBIDDEN, getAdmin, type AdminActionResult } from "@/lib/auth";
import { computeAndSaveScores } from "@/lib/scoring/compute-scores";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Each action re-checks admin and returns a 403 result otherwise (never a
// redirect). Writes go through the admin's own session, so RLS ("admins
// decide/flag", decided_by = current member) is enforced too. Recomputing scores afterwards
// uses the secret-key client, like the cron job.

async function refreshScores() {
  await computeAndSaveScores(createAdminClient());
  revalidatePath("/", "layout");
}

export async function decideShipped(
  messageId: string,
  decision: "shipped" | "progress",
): Promise<AdminActionResult> {
  const viewer = await getAdmin();
  if (!viewer) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase
    .from("shipped_approvals")
    .update({
      status: decision,
      decided_by: viewer.memberId,
      decided_at: new Date().toISOString(),
    })
    .eq("message_id", messageId);
  if (error) throw new Error(error.message);
  await refreshScores();
  return { ok: true };
}

export async function reopenShipped(
  messageId: string,
): Promise<AdminActionResult> {
  if (!(await getAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase
    .from("shipped_approvals")
    .update({ status: "pending", decided_by: null, decided_at: null })
    .eq("message_id", messageId);
  if (error) throw new Error(error.message);
  await refreshScores();
  return { ok: true };
}

/** Queues a message for shipped review (e.g. the classifier missed a launch). */
export async function flagShipped(
  messageId: string,
): Promise<AdminActionResult> {
  if (!(await getAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from("shipped_approvals").insert({
    message_id: messageId,
    source: "manual",
    status: "pending",
    priority: 50,
  });
  // Already in the queue (or decided): nothing to do.
  if (error && error.code !== "23505") throw new Error(error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}
