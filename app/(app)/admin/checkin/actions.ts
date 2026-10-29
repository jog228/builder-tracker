"use server";

import { revalidatePath } from "next/cache";
import {
  applyCheckin,
  type CheckinResult,
  type CheckinTarget,
} from "@/lib/attendance/checkin";
import { checkNewMeeting } from "@/lib/attendance/meeting-days";
import { inSeason, meetingLabel } from "@/lib/attendance/weeks";
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

  // Scheduling on a skipped day un-skips it (the database rejects a meeting
  // on a skipped date).
  const unskip = await supabase
    .from("meeting_skips")
    .delete()
    .eq("date", check.date);
  if (unskip.error)
    return { ok: false, status: 400, error: unskip.error.message };

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

export type SkipResult =
  | { ok: true; removedSignIns: number }
  | { ok: false; status: 400 | 403 | 409; error: string }
  /** The meeting has sign-ins: ask, then call again with removeSignIns. */
  | { ok: false; status: 409; error: string; confirmSignIns: number };

const isDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const NOTE_MAX = 200;

/**
 * "No meeting this week": admins only (403 otherwise). Marks `date` skipped
 * and removes its meeting, in one transaction (skip_meeting() in the
 * database). A meeting with sign-ins is only skipped when the admin
 * confirmed removing them; one with demos never is (409).
 */
export async function skipMeeting(
  date: string,
  note: string,
  removeSignIns: boolean,
): Promise<SkipResult> {
  const viewer = await getAdmin();
  if (!viewer) return FORBIDDEN;
  if (!isDate(date) || !inSeason(date))
    return { ok: false, status: 400, error: "Pick a meeting this season." };
  if (note.length > NOTE_MAX)
    return {
      ok: false,
      status: 400,
      error: `Keep the note under ${NOTE_MAX} characters.`,
    };

  const supabase = await createClient();
  if (!removeSignIns) {
    const { data: meeting, error: mError } = await supabase
      .from("events")
      .select("attendance(count)")
      .eq("type", "meeting")
      .eq("date", date)
      .maybeSingle<{ attendance: { count: number }[] }>();
    if (mError) return { ok: false, status: 400, error: mError.message };
    const signIns = meeting?.attendance[0]?.count ?? 0;
    if (signIns > 0)
      return {
        ok: false,
        status: 409,
        error: `${signIns} ${signIns === 1 ? "builder is" : "builders are"} signed in to this meeting.`,
        confirmSignIns: signIns,
      };
  }
  const { data, error } = await supabase.rpc("skip_meeting", {
    p_date: date,
    p_reason: note,
    p_remove_sign_ins: removeSignIns,
  });
  if (error?.code === "23505")
    return { ok: false, status: 409, error: "That date is already skipped." };
  if (error?.code === "23514")
    return { ok: false, status: 409, error: `Not skipped: ${error.message}.` };
  if (error?.code === "42501") return FORBIDDEN;
  if (error) return { ok: false, status: 400, error: error.message };
  revalidatePath("/admin/checkin");
  if (data > 0) scheduleRecompute();
  return { ok: true, removedSignIns: data };
}

/**
 * "Undo skip": admins only (403 otherwise). The usual meeting day is offered
 * again (and created when opened).
 */
export async function unskipMeeting(
  date: string,
): Promise<{ ok: true } | { ok: false; status: 400 | 403; error: string }> {
  const viewer = await getAdmin();
  if (!viewer) return FORBIDDEN;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meeting_skips")
    .delete()
    .eq("date", date)
    .select("date");
  if (error) return { ok: false, status: 400, error: error.message };
  if (!data.length)
    return { ok: false, status: 400, error: "That date isn't skipped." };
  revalidatePath("/admin/checkin");
  return { ok: true };
}
