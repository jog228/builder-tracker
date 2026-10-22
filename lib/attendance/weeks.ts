// Weekly meeting dates. Pure; weeks start Monday in club time (lib/scoring/time).
import { SEASON_START, WEEKLY_MEETING } from "@/lib/scoring/config";
import { weekKey } from "@/lib/scoring/time";

const DAY = 86_400_000;
const toUtc = (d: string) =>
  Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const WEEK = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" of the meeting in the week starting on Monday `week`. */
export const meetingDate = (week: string) =>
  fromUtc(toUtc(week) + (WEEKLY_MEETING.weekday - 1) * DAY);

/** Monday of the season's first meeting: the first on or after SEASON_START. */
export function seasonFirstWeek(seasonStart: string = SEASON_START): string {
  const week = weekKey(seasonStart);
  return meetingDate(week) >= seasonStart
    ? week
    : fromUtc(toUtc(week) + 7 * DAY);
}

/** True for a meeting date on or after the season's first meeting. */
export const inSeason = (date: string, seasonStart: string = SEASON_START) =>
  date >= meetingDate(seasonFirstWeek(seasonStart));

/**
 * This week back to the season's first meeting, newest first. Before the
 * season starts, just the first meeting's week.
 */
export function pickerWeeks(
  now: Date = new Date(),
  seasonStart: string = SEASON_START,
): string[] {
  const first = toUtc(seasonFirstWeek(seasonStart));
  const current = Math.max(toUtc(weekKey(now)), first);
  const weeks: string[] = [];
  for (let ms = current; ms >= first; ms -= 7 * DAY) weeks.push(fromUtc(ms));
  return weeks;
}

/** The ?week= param if it's one of the picker's weeks, else the newest. */
export function resolveWeek(
  param: string | undefined,
  now: Date = new Date(),
  seasonStart: string = SEASON_START,
): string {
  const weeks = pickerWeeks(now, seasonStart);
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

/** The season's first meeting. */
export const isKickoff = (date: string, seasonStart: string = SEASON_START) =>
  date === meetingDate(seasonFirstWeek(seasonStart));

/** "Kickoff · Thu, Oct 1" for the season's first meeting, else "Thu, Oct 8". */
export const meetingTitle = (
  date: string,
  seasonStart: string = SEASON_START,
) =>
  isKickoff(date, seasonStart)
    ? `Kickoff · ${meetingLabel(date)}`
    : meetingLabel(date);

/** "4:30 PM" from the config's 24-hour time. */
export function meetingTimeLabel(time: string = WEEKLY_MEETING.time) {
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
