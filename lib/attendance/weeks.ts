// Weekly meeting dates. Pure; weeks start Monday in club time (lib/scoring/time).
import { WEEKLY_MEETING } from "@/lib/scoring/config";
import { weekKey } from "@/lib/scoring/time";

const DAY = 86_400_000;
const toUtc = (d: string) =>
  Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const WEEK = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" of the meeting in the week starting on Monday `week`. */
export const meetingDate = (week: string) =>
  fromUtc(toUtc(week) + (WEEKLY_MEETING.weekday - 1) * DAY);

/** This week and the previous `pickerWeeks - 1`, newest first. */
export function pickerWeeks(now: Date = new Date()): string[] {
  const current = toUtc(weekKey(now));
  return Array.from({ length: WEEKLY_MEETING.pickerWeeks }, (_, i) =>
    fromUtc(current - i * 7 * DAY),
  );
}

/** The ?week= param if it's one of the picker's weeks, else this week. */
export function resolveWeek(
  param: string | undefined,
  now: Date = new Date(),
): string {
  const weeks = pickerWeeks(now);
  if (!param || !WEEK.test(param)) return weeks[0];
  const monday = weekKey(param);
  return weeks.includes(monday) ? monday : weeks[0];
}

const longFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "Thu, Oct 23" for a plain date. */
export const meetingLabel = (date: string) =>
  longFmt.format(new Date(`${date}T12:00:00Z`));

/** "4:30 PM" from the config's 24-hour time. */
export function meetingTimeLabel(time: string = WEEKLY_MEETING.time) {
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
