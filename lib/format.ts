import { TIME_ZONE } from "@/lib/scoring/config";

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  });

/**
 * "Oct 8" for a plain date ("2026-10-08", read as that calendar day) or a
 * timestamp (read in club time). Plain dates would otherwise parse as UTC
 * midnight and show the previous day in Eastern time.
 */
export const dayLabel = (dateOrIso: string) =>
  shortDate(
    /^\d{4}-\d{2}-\d{2}$/.test(dateOrIso)
      ? `${dateOrIso}T12:00:00Z`
      : dateOrIso,
  );

export const monthLabel = (period: string) =>
  new Date(`${period}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

export const plural = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? "" : "s"}`;
