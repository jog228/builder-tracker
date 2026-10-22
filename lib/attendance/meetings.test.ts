import { describe, expect, it } from "vitest";
import { attendanceRate, meetingsHeld, type MeetingEvent } from "./meetings";

// Season starts Oct 1 (SEASON_START). Today is Thursday Oct 22.
const TODAY = "2026-10-22";
const week = (date: string): MeetingEvent => ({ date, weekly: true });
const events: MeetingEvent[] = [
  week("2026-09-24"), // before the season: never counts
  week("2026-10-01"),
  week("2026-10-08"),
  week("2026-10-15"),
  week("2026-10-22"), // today counts
  week("2026-10-29"), // future: doesn't count yet
  { date: "2026-10-10", weekly: false }, // a one-off event isn't a meeting
];

describe("meetingsHeld", () => {
  it("counts season meetings dated today or earlier in the month", () => {
    expect(meetingsHeld(events, { today: TODAY, month: "2026-10" })).toEqual([
      "2026-10-01",
      "2026-10-08",
      "2026-10-15",
      "2026-10-22",
    ]);
  });
  it("leaves out today's meeting until its date when it's still ahead", () => {
    expect(
      meetingsHeld(events, { today: "2026-10-21", month: "2026-10" }),
    ).toHaveLength(3);
  });
  it("all time covers every month since the season start", () => {
    const later = [...events, week("2026-11-05")];
    expect(
      meetingsHeld(later, { today: "2026-11-10", month: null }),
    ).toHaveLength(6);
    expect(
      meetingsHeld(later, { today: "2026-11-10", month: "2026-11" }),
    ).toEqual(["2026-11-05"]);
  });
  it("ignores duplicate dates", () => {
    expect(
      meetingsHeld([week("2026-10-08"), week("2026-10-08")], {
        today: TODAY,
        month: null,
      }),
    ).toEqual(["2026-10-08"]);
  });
});

describe("attendanceRate", () => {
  const held = ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"];

  it("divides meetings attended by meetings held", () => {
    expect(attendanceRate(held, ["2026-10-01", "2026-10-15"])).toEqual({
      held: 4,
      attended: 2,
      pct: 50,
    });
    expect(attendanceRate(held, held)).toMatchObject({ pct: 100 });
    expect(attendanceRate(held, [])).toMatchObject({ attended: 0, pct: 0 });
  });
  it("rounds to a whole percent", () => {
    expect(attendanceRate(held.slice(0, 3), ["2026-10-01"]).pct).toBe(33);
    expect(
      attendanceRate(held.slice(0, 3), ["2026-10-01", "2026-10-08"]).pct,
    ).toBe(67);
  });
  it("only counts attendance at a held meeting, so it can't pass 100%", () => {
    expect(
      attendanceRate(held, [...held, "2026-10-29", "2026-09-24", "2026-10-08"]),
    ).toEqual({ held: 4, attended: 4, pct: 100 });
  });
  it("has no rate when no meetings have been held", () => {
    expect(attendanceRate([], [])).toEqual({ held: 0, attended: 0, pct: null });
    expect(attendanceRate([], ["2026-10-29"])).toEqual({
      held: 0,
      attended: 0,
      pct: null,
    });
  });
});
