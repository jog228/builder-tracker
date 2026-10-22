// "Never Misses": earned for a month when a member attended 100% of that
// month's held weekly meetings, with at least BADGES.neverMisses.minMeetings
// held. Awarded only after the month ends, and then permanent. During the
// month the tile shows "On track · 4 of 4". Pure, and built on the same
// helpers as the profile's Events attended bar, so the numbers always agree.
import {
  attendanceRate,
  meetingsHeld,
  type MeetingEvent,
} from "@/lib/attendance/meetings";
import { BADGES } from "@/lib/scoring/config";
import { isRankable, type EligibilityFields } from "@/lib/scoring/eligibility";
import { monthKey } from "@/lib/scoring/time";

/** 100% of a month's held meetings, with the minimum held. */
function perfectMonth(
  meetings: MeetingEvent[],
  attendedDates: string[],
  today: string,
  month: string,
) {
  const held = meetingsHeld(meetings, { today, month });
  const rate = attendanceRate(held, attendedDates);
  return {
    ...rate,
    perfect: held.length >= BADGES.neverMisses.minMeetings && rate.pct === 100,
  };
}

/**
 * Completed months ("YYYY-MM", oldest first) a member earned Never Misses, as
 * of `today` (club time "YYYY-MM-DD"). The current month never counts until
 * it ends. Exec board and inactive members never earn it.
 */
export function neverMissesMonths(
  member: EligibilityFields,
  meetings: MeetingEvent[],
  attendedDates: string[],
  today: string,
): string[] {
  if (!isRankable(member)) return [];
  const current = monthKey(today);
  const months = [
    ...new Set(meetingsHeld(meetings, { today, month: null }).map(monthKey)),
  ]
    .filter((m) => m < current)
    .sort();
  return months.filter(
    (month) => perfectMonth(meetings, attendedDates, today, month).perfect,
  );
}

export type MonthProgress = {
  attended: number;
  held: number;
  /** 100% so far this month (any meetings held). */
  onTrack: boolean;
};

/** This month so far, for the tile ("On track · 4 of 4"). Null for exec/inactive. */
export function neverMissesThisMonth(
  member: EligibilityFields,
  meetings: MeetingEvent[],
  attendedDates: string[],
  today: string,
): MonthProgress | null {
  if (!isRankable(member)) return null;
  const { attended, held } = perfectMonth(
    meetings,
    attendedDates,
    today,
    monthKey(today),
  );
  return { attended, held, onTrack: held > 0 && attended === held };
}

/**
 * What the award step changes. Completed months are permanent: rows are only
 * ever added for them, never removed. The only removals are rows for the
 * current or a future month, which shouldn't exist (they're awarded only
 * after the month ends).
 */
export function badgeSync(
  want: Set<string>,
  have: { key: string; period: string }[],
  currentMonth: string,
): { add: string[]; remove: string[] } {
  const haveKeys = new Set(have.map((h) => h.key));
  return {
    add: [...want].filter((k) => !haveKeys.has(k)),
    remove: have
      .filter((h) => h.period !== "all" && h.period >= currentMonth)
      .map((h) => h.key),
  };
}

/** "Oct 2026" for "2026-10". */
export const badgeMonthLabel = (period: string) =>
  new Date(`${period}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
