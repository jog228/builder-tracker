"use server";

import { revalidatePath } from "next/cache";
import {
  applyCheckin,
  type CheckinResult,
  type CheckinTarget,
} from "@/lib/attendance/checkin";
import { checkNewMeeting } from "@/lib/attendance/meeting-days";
import { meetingLabel } from "@/lib/attendance/weeks";
import { FORBIDDEN, getAdmin, getViewer } from "@/lib/auth";
import { listMeetings, supabaseCheckinStore } from "@/lib/data/checkin";
import { WEEKLY_MEETING } from "@/lib/scoring/config";
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
  // applyCheckin returns 403 for anyone who isn't an admin.
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

export type CreateMeetingResult =
  | { ok: true; date: string }
  | { ok: false; status: 400 | 403; error: string }
  | { ok: false; status: 409; error: string; conflictDate: string };

/**
 * "+ New meeting": admins only (403 otherwise). One meeting per date, checked
 * here and by the database's unique index. Title and weight copy the latest
 * meeting; the date and start time come from the form.
 */
export async function createMeeting(
  date: string,
  time: string,
): Promise<CreateMeetingResult> {
  const viewer = await getAdmin();
  if (!viewer) return FORBIDDEN;

  const supabase = await createClient();
  const meetings = await listMeetings(supabase);
  const check = checkNewMeeting(
    { date, time },
    meetings.map((m) => m.date),
  );
  if (!check.ok) return check;

  const latest = meetings[0] ?? null;
  const { error } = await supabase.from("events").insert({
    name: latest?.name ?? WEEKLY_MEETING.name,
    date: check.date,
    type: "meeting",
    weight: latest?.weight ?? WEEKLY_MEETING.weight,
    start_time: check.time,
    weekly: true,
    created_by: viewer.memberId,
  });
  if (error?.code === "23505")
    return {
      ok: false,
      status: 409,
      error: `There's already a meeting on ${meetingLabel(check.date)}`,
      conflictDate: check.date,
    };
  if (error) return { ok: false, status: 400, error: error.message };
  revalidatePath("/admin/checkin");
  return { ok: true, date: check.date };
}
