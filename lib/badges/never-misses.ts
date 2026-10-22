// "Never Misses": earned for a month when a member attended 100% of that
// month's held weekly meetings, with at least BADGES.neverMisses.minMeetings
// held. Pure, and built on the same helpers as the profile's Events attended
// bar, so the numbers always agree.
import {
  attendanceRate,
  meetingsHeld,
  type MeetingEvent,
} from "@/lib/attendance/meetings";
import { BADGES } from "@/lib/scoring/config";
import { isRankable, type EligibilityFields } from "@/lib/scoring/eligibility";
import { monthKey } from "@/lib/scoring/time";

/**
 * The months ("YYYY-MM", oldest first) a member earned Never Misses, as of
 * `today` (club time "YYYY-MM-DD"). Exec board and inactive members never
 * earn it. A month still in progress can be earned, and lost again if they
 * miss a later meeting that month.
 */
export function neverMissesMonths(
  member: EligibilityFields,
  meetings: MeetingEvent[],
  attendedDates: string[],
  today: string,
): string[] {
  if (!isRankable(member)) return [];
  const months = [
    ...new Set(meetingsHeld(meetings, { today, month: null }).map(monthKey)),
  ].sort();
  return months.filter((month) => {
    const held = meetingsHeld(meetings, { today, month });
    if (held.length < BADGES.neverMisses.minMeetings) return false;
    return attendanceRate(held, attendedDates).attended === held.length;
  });
}

/** "Oct 2026" for "2026-10". */
export const badgeMonthLabel = (period: string) =>
  new Date(`${period}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
