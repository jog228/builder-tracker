import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingEvent } from "@/lib/attendance/meetings";

/** All weekly meetings (date + weekly flag), for meetingsHeld(). */
export async function getWeeklyMeetings(
  supabase: SupabaseClient,
): Promise<MeetingEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("date, weekly")
    .eq("weekly", true);
  if (error) throw error;
  return data ?? [];
}
