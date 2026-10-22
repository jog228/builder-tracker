"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { computeAndSaveScores } from "@/lib/scoring/compute-scores";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Writes go through the admin's own session, so RLS ("admins decide/flag",
// decided_by = current member) is enforced. Recomputing scores afterwards
// uses the secret-key client, like the cron job.

async function refreshScores() {
  await computeAndSaveScores(createAdminClient());
  revalidatePath("/", "layout");
}

export async function decideShipped(
  messageId: string,
  decision: "shipped" | "progress",
) {
  const viewer = await requireAdmin();
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
}

export async function reopenShipped(messageId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("shipped_approvals")
    .update({ status: "pending", decided_by: null, decided_at: null })
    .eq("message_id", messageId);
  if (error) throw new Error(error.message);
  await refreshScores();
}

/** Queues a message for shipped review (e.g. the classifier missed a launch). */
export async function flagShipped(messageId: string) {
  await requireAdmin();
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
}
