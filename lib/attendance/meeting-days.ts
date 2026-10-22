// Meeting days for the check-in page: which dates the picker offers, which
// one opens by default, the "+ New meeting" defaults, and validation. Pure.
// One meeting per date (the database enforces it too).
import { SEASON_START, WEEKLY_MEETING } from "@/lib/scoring/config";
import { localDate, weekKey } from "@/lib/scoring/time";
import {
  inSeason,
  meetingDate,
  meetingTitle,
  pickerWeeks,
  resolveWeek,
} from "./weeks";

const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const toUtc = (d: string) =>
  Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** How far ahead a meeting can be scheduled. */
export const MAX_DAYS_AHEAD = 120;

export type MeetingOption = {
  date: string;
  /** This week's usual meeting day (what the page opens to). */
  current: boolean;
  /** Dated after today: shown, but sign-ins open on the day. */
  upcoming: boolean;
  /** A meeting row already exists (otherwise it's created on open). */
  exists: boolean;
};

/**
 * Picker dates, newest first: every season week's usual meeting day up to
 * this week (opened, and created, as before), plus every existing meeting
 * since the season start, future ones included.
 */
export function meetingOptions(
  existingDates: string[],
  now: Date = new Date(),
  seasonStart: string = SEASON_START,
): MeetingOption[] {
  const today = localDate(now);
  const current = meetingDate(weekKey(now));
  const existing = new Set(
    existingDates.filter((d) => inSeason(d, seasonStart)),
  );
  const defaults = pickerWeeks(now, seasonStart).map(meetingDate);
  return [...new Set([...defaults, ...existing])]
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({
      date,
      current: date === current,
      upcoming: date > today,
      exists: existing.has(date),
    }));
}

/** The picker label: "Upcoming · Thu, Oct 29", "This week · Thu, Oct 22", "Kickoff · Thu, Oct 1". */
export const optionLabel = (o: MeetingOption, seasonStart = SEASON_START) =>
  `${o.upcoming ? "Upcoming · " : o.current ? "This week · " : ""}${meetingTitle(o.date, seasonStart)}`;

/**
 * The date to open: ?date= if it's offered, else ?week= (older links), else
 * this week's usual meeting day.
 */
export function resolveMeetingDate(
  params: { date?: string; week?: string },
  options: MeetingOption[],
  now: Date = new Date(),
): string {
  const offered = new Set(options.map((o) => o.date));
  if (params.date && offered.has(params.date)) return params.date;
  if (params.week) {
    const d = meetingDate(resolveWeek(params.week, now));
    if (offered.has(d)) return d;
  }
  return options.find((o) => o.current)?.date ?? options[0].date;
}

/**
 * "+ New meeting" default: the first usual meeting weekday after the latest
 * existing meeting (or this week's, if there are none yet).
 */
export function nextMeetingDate(
  latest: string | null,
  now: Date = new Date(),
): string {
  if (!latest) return meetingDate(weekKey(now));
  let ms = toUtc(latest) + DAY;
  while (((new Date(ms).getUTCDay() + 6) % 7) + 1 !== WEEKLY_MEETING.weekday)
    ms += DAY;
  return fromUtc(ms);
}

/** "4:30 PM" from "16:30" (or "16:30:00" as Postgres returns it). */
export function timeLabel(time: string = WEEKLY_MEETING.time): string {
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export type NewMeetingCheck =
  | { ok: true; date: string; time: string }
  | { ok: false; status: 400; error: string }
  | { ok: false; status: 409; error: string; conflictDate: string };

/** Validates a new meeting: a real date in the season, not too far out, a time, and a free date. */
export function checkNewMeeting(
  input: { date: string; time: string },
  existingDates: string[],
  now: Date = new Date(),
  seasonStart: string = SEASON_START,
): NewMeetingCheck {
  const { date, time } = input;
  if (!DATE.test(date) || fromUtc(toUtc(date)) !== date)
    return { ok: false, status: 400, error: "Pick a valid date." };
  if (!TIME.test(time))
    return { ok: false, status: 400, error: "Pick a valid time." };
  if (!inSeason(date, seasonStart))
    return {
      ok: false,
      status: 400,
      error: "That's before the season started.",
    };
  if (toUtc(date) - toUtc(localDate(now)) > MAX_DAYS_AHEAD * DAY)
    return {
      ok: false,
      status: 400,
      error: `Schedule at most ${MAX_DAYS_AHEAD} days ahead.`,
    };
  if (existingDates.includes(date))
    return {
      ok: false,
      status: 409,
      error: `There's already a meeting on ${meetingTitle(date, seasonStart).replace(/^Kickoff · /, "")}`,
      conflictDate: date,
    };
  return { ok: true, date, time };
}
