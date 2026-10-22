// "Meetings held" and attendance rate. Pure; shared by the profile breakdown
// now and Stats / the leaderboard later. Points are unaffected: attending
// still earns WEIGHTS.eventAttended per meeting (see lib/scoring/compute.ts).
import { inSeason } from "@/lib/attendance/weeks";
import { monthKey } from "@/lib/scoring/time";

export type MeetingEvent = { date: string; weekly: boolean };

/**
 * Dates of weekly meetings that have happened: on or after the season's first
 * meeting, dated `today` or earlier (club time), and in `month` ("YYYY-MM")
 * unless it's null (all time). Sorted, without duplicates.
 */
export function meetingsHeld(
  events: MeetingEvent[],
  { today, month }: { today: string; month: string | null },
): string[] {
  const dates = events
    .filter(
      (e) =>
        e.weekly &&
        inSeason(e.date) &&
        e.date <= today &&
        (month === null || monthKey(e.date) === month),
    )
    .map((e) => e.date);
  return [...new Set(dates)].sort();
}

export type AttendanceRate = {
  held: number;
  attended: number;
  /** 0–100, rounded; null when no meetings have been held. */
  pct: number | null;
};

/**
 * Meetings attended ÷ meetings held. Only attendance at a held meeting
 * counts, so a future or out-of-period meeting can't push it past 100%. A
 * demo marks attendance, so demos are already included.
 */
export function attendanceRate(
  held: string[],
  attendedDates: string[],
): AttendanceRate {
  const heldSet = new Set(held);
  const attended = new Set(attendedDates.filter((d) => heldSet.has(d))).size;
  return {
    held: heldSet.size,
    attended,
    pct: heldSet.size ? Math.round((attended / heldSet.size) * 100) : null,
  };
}
