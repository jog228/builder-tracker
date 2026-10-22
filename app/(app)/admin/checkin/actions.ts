"use server";

import {
  applyCheckin,
  type CheckinResult,
  type CheckinTarget,
} from "@/lib/attendance/checkin";
import { getViewer } from "@/lib/auth";
import { supabaseCheckinStore } from "@/lib/data/checkin";
import { scheduleRecompute } from "@/lib/scoring/recompute";
import { createClient } from "@/lib/supabase/server";

/**
 * Sets one member's check-in. Re-checks admin here (403 otherwise) and writes
 * through the admin's own session, so RLS is the second line of defense.
 */
export async function setCheckin(
  eventId: string,
  memberId: string,
  target: CheckinTarget,
): Promise<CheckinResult> {
  const viewer = await getViewer();
  const result = await applyCheckin(
    viewer && { memberId: viewer.memberId, isAdmin: viewer.isAdmin },
    supabaseCheckinStore(await createClient()),
    { eventId, memberId, target },
  ).catch((err: Error): CheckinResult => {
    console.error("[checkin] failed:", err.message);
    return { ok: false, status: 400, error: "Couldn't save. Try again." };
  });
  if (result.ok) scheduleRecompute();
  return result;
}
