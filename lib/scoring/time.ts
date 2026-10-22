import { TIME_ZONE } from "./config";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" in club time. Plain dates ("2026-10-09") pass through. */
export function localDate(at: string | Date): string {
  if (typeof at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(at)) return at;
  return dateFmt.format(typeof at === "string" ? new Date(at) : at);
}

/** "YYYY-MM" in club time. */
export const monthKey = (at: string | Date) => localDate(at).slice(0, 7);

const DAY = 86_400_000;
const toUtc = (d: string) =>
  Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Monday ("YYYY-MM-DD") of the club-time week containing `at`. */
export function weekKey(at: string | Date): string {
  const ms = toUtc(localDate(at));
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
  return fromUtc(ms - dow * DAY);
}

/** The Monday one week before a week key. */
export const prevWeek = (week: string) => fromUtc(toUtc(week) - 7 * DAY);
