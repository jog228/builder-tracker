import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckinRow, CheckinStore } from "@/lib/attendance/checkin";
import { WEEKLY_MEETING } from "@/lib/scoring/config";
import { fetchAll } from "@/lib/supabase/fetch-all";

// Everything here runs with the admin's own session (lib/supabase/server), so
// RLS ("admins mark", recorded_by = themselves) applies to every write.

const UNIQUE = "23505";

export type MeetingRow = {
  id: string;
  name: string;
  date: string;
  start_time: string | null;
  weight: number;
};

const MEETING_COLUMNS = "id, name, date, start_time, weight";

/** Every meeting (newest first), for the picker and "+ New meeting" defaults. */
export async function listMeetings(
  supabase: SupabaseClient,
): Promise<MeetingRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select(MEETING_COLUMNS)
    .eq("type", "meeting")
    .order("date", { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * The meeting on `date`, created on first open if it's a season week's usual
 * meeting day (copying the latest meeting's title, weight and time). One
 * meeting per date: the database's unique index settles races.
 */
export async function ensureMeetingOn(
  supabase: SupabaseClient,
  date: string,
  createdBy: string,
  latest: MeetingRow | null,
): Promise<MeetingRow> {
  const find = () =>
    supabase
      .from("events")
      .select(MEETING_COLUMNS)
      .eq("type", "meeting")
      .eq("date", date)
      .maybeSingle();
  const existing = await find();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const { data, error } = await supabase
    .from("events")
    .insert({
      name: latest?.name ?? WEEKLY_MEETING.name,
      date,
      type: "meeting",
      weight: latest?.weight ?? WEEKLY_MEETING.weight,
      start_time: latest?.start_time ?? null,
      weekly: true,
      created_by: createdBy,
    })
    .select(MEETING_COLUMNS)
    .single();
  if (!error) return data;
  // Another admin opened the same date at the same moment.
  if (error.code === UNIQUE) {
    const again = await find();
    if (again.data) return again.data;
  }
  throw error;
}

export function supabaseCheckinStore(supabase: SupabaseClient): CheckinStore {
  const check = (error: { code?: string; message: string } | null) => {
    if (error && error.code !== UNIQUE) throw new Error(error.message);
  };
  return {
    async getEvent(id) {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, weekly")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async getMember(id) {
      const { data, error } = await supabase
        .from("members")
        .select("active, exclude_from_rankings")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (
        data && { active: data.active, excluded: data.exclude_from_rankings }
      );
    },
    async getRow(eventId, memberId): Promise<CheckinRow> {
      const [att, demo] = await Promise.all([
        supabase
          .from("attendance")
          .select("recorded_by, recorded_at")
          .eq("event_id", eventId)
          .eq("member_id", memberId)
          .maybeSingle(),
        supabase
          .from("bonus_points")
          .select("id")
          .eq("event_id", eventId)
          .eq("member_id", memberId)
          .eq("type", "demo")
          .is("revoked_at", null)
          .maybeSingle(),
      ]);
      if (att.error) throw att.error;
      if (demo.error) throw demo.error;
      return {
        present: !!att.data,
        demoId: demo.data?.id ?? null,
        recordedBy: att.data?.recorded_by ?? null,
        recordedAt: att.data?.recorded_at ?? null,
      };
    },
    async markPresent(eventId, memberId, by) {
      const { error } = await supabase
        .from("attendance")
        .insert({ event_id: eventId, member_id: memberId, recorded_by: by });
      check(error);
    },
    async unmarkPresent(eventId, memberId) {
      const { error } = await supabase
        .from("attendance")
        .delete()
        .eq("event_id", eventId)
        .eq("member_id", memberId);
      check(error);
    },
    async awardDemo(eventId, memberId, by, points, reason) {
      const { error } = await supabase.from("bonus_points").insert({
        member_id: memberId,
        event_id: eventId,
        type: "demo",
        points,
        reason,
        awarded_by: by,
      });
      check(error);
    },
    async revokeDemo(bonusId, by) {
      const { error } = await supabase
        .from("bonus_points")
        .update({ revoked_at: new Date().toISOString(), revoked_by: by })
        .eq("id", bonusId)
        .is("revoked_at", null);
      check(error);
    },
  };
}

export type SheetMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  present: boolean;
  demo: boolean;
  recordedBy: string | null;
  recordedAt: string | null;
};

/** One week's sign-in sheet: rankable members only (exec board hidden). */
export async function getCheckinSheet(
  supabase: SupabaseClient,
  date: string,
  viewerId: string,
  latest: MeetingRow | null,
) {
  const event = await ensureMeetingOn(supabase, date, viewerId, latest);
  const [members, attendance, demos, admins, execs] = await Promise.all([
    fetchAll<{ id: string; display_name: string; avatar_url: string | null }>(
      (f, t) =>
        supabase
          .from("ranked_members")
          .select("id, display_name, avatar_url")
          .order("display_name")
          .range(f, t),
    ),
    supabase
      .from("attendance")
      .select("member_id, recorded_by, recorded_at")
      .eq("event_id", event.id),
    supabase
      .from("bonus_points")
      .select("member_id")
      .eq("event_id", event.id)
      .eq("type", "demo")
      .is("revoked_at", null),
    supabase.from("members").select("id, display_name").eq("role", "admin"),
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .eq("exclude_from_rankings", true),
  ]);
  for (const r of [attendance, demos, admins]) if (r.error) throw r.error;

  const att = new Map(attendance.data!.map((a) => [a.member_id, a]));
  const demoed = new Set(demos.data!.map((d) => d.member_id));
  const sheet: SheetMember[] = members
    .map((m) => ({
      id: m.id,
      name: m.display_name,
      avatarUrl: m.avatar_url,
      present: att.has(m.id),
      demo: demoed.has(m.id),
      recordedBy: att.get(m.id)?.recorded_by ?? null,
      recordedAt: att.get(m.id)?.recorded_at ?? null,
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );

  return {
    event,
    members: sheet,
    recorders: Object.fromEntries(
      admins.data!.map((a) => [a.id, a.display_name]),
    ) as Record<string, string>,
    hiddenExecs: execs.count ?? 0,
  };
}
