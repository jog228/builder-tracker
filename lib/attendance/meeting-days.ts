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
 * The meeting a week resolves to: an existing meeting that week (the latest
 * one on or before `today`, else the earliest), else the usual meeting day.
 */
function weekMeeting(week: string, existing: string[], today: string): string {
  const inWeek = existing.filter((d) => weekKey(d) === week).sort();
  if (!inWeek.length) return meetingDate(week);
  return inWeek.filter((d) => d <= today).at(-1) ?? inWeek[0];
}

/**
 * Picker dates, newest first: every existing meeting since the season start
 * (future ones included), plus the usual meeting day of each season week up
 * to this week that has no meeting yet (opened, and created, as before). A
 * week that already has a meeting on another day gets no extra Thursday, and
 * a skipped usual day (`meeting_skips`) isn't offered at all.
 */
export function meetingOptions(
  existingDates: string[],
  now: Date = new Date(),
  {
    skipped = [],
    seasonStart = SEASON_START,
  }: { skipped?: string[]; seasonStart?: string } = {},
): MeetingOption[] {
  const today = localDate(now);
  const existing = existingDates.filter((d) => inSeason(d, seasonStart));
  const existingSet = new Set(existing);
  const skippedSet = new Set(skipped);
  const weeksWithMeetings = new Set(existing.map((d) => weekKey(d)));
  const defaults = pickerWeeks(now, seasonStart)
    .filter((w) => !weeksWithMeetings.has(w))
    .map(meetingDate)
    .filter((d) => !skippedSet.has(d));
  const current = weekMeeting(weekKey(now), existing, today);
  return [...new Set([...defaults, ...existing])]
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({
      date,
      current: date === current,
      upcoming: date > today,
      exists: existingSet.has(date),
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
    const existing = options.filter((o) => o.exists).map((o) => o.date);
    const d = weekMeeting(
      resolveWeek(params.week, now),
      existing,
      localDate(now),
    );
    if (offered.has(d)) return d;
  }
  // This week skipped: the next upcoming meeting, else the latest one.
  return (
    options.find((o) => o.current)?.date ??
    options.filter((o) => o.upcoming).at(-1)?.date ??
    options[0].date
  );
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
