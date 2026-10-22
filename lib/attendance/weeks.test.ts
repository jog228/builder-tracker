import { describe, expect, it } from "vitest";
import {
  inSeason,
  isKickoff,
  meetingDate,
  meetingLabel,
  meetingTimeLabel,
  meetingTitle,
  pickerWeeks,
  resolveWeek,
  seasonFirstWeek,
} from "./weeks";

// Thursday Oct 22 2026, 9pm Eastern (already Friday in UTC).
const NOW = new Date("2026-10-23T01:00:00Z");

describe("meetingDate", () => {
  it("puts the meeting on the configured weekday of that week", () => {
    expect(meetingDate("2026-10-19")).toBe("2026-10-22");
    expect(meetingDate("2026-12-28")).toBe("2026-12-31");
  });
});

describe("season", () => {
  it("starts at the Oct 1 kickoff (SEASON_START)", () => {
    expect(seasonFirstWeek()).toBe("2026-09-28");
    expect(meetingDate(seasonFirstWeek())).toBe("2026-10-01");
    expect(isKickoff("2026-10-01")).toBe(true);
    expect(isKickoff("2026-10-08")).toBe(false);
  });
  it("skips a meeting that falls before a mid-week season start", () => {
    expect(seasonFirstWeek("2026-10-02")).toBe("2026-10-05");
  });
  it("knows which meetings are in season", () => {
    expect(inSeason("2026-10-01")).toBe(true);
    expect(inSeason("2026-09-24")).toBe(false);
  });
});

describe("pickerWeeks", () => {
  it("runs from this week back to the kickoff and no earlier", () => {
    expect(pickerWeeks(NOW)).toEqual([
      "2026-10-19",
      "2026-10-12",
      "2026-10-05",
      "2026-09-28",
    ]);
  });
  it("grows as the season goes on", () => {
    const weeks = pickerWeeks(new Date("2026-12-10T17:00:00Z"));
    expect(weeks[0]).toBe("2026-12-07");
    expect(weeks.at(-1)).toBe("2026-09-28");
    expect(weeks).toHaveLength(11);
  });
  it("offers just the kickoff week before the season starts", () => {
    expect(pickerWeeks(new Date("2026-09-01T17:00:00Z"))).toEqual([
      "2026-09-28",
    ]);
  });
});

describe("resolveWeek", () => {
  it("defaults to this week", () => {
    expect(resolveWeek(undefined, NOW)).toBe("2026-10-19");
    expect(resolveWeek("garbage", NOW)).toBe("2026-10-19");
  });
  it("opens any past meeting since the kickoff, by any day of its week", () => {
    expect(resolveWeek("2026-10-01", NOW)).toBe("2026-09-28");
    expect(resolveWeek("2026-10-08", NOW)).toBe("2026-10-05");
    expect(resolveWeek("2026-10-15", NOW)).toBe("2026-10-12");
  });
  it("rejects future weeks and weeks before the season", () => {
    expect(resolveWeek("2026-10-26", NOW)).toBe("2026-10-19");
    expect(resolveWeek("2026-09-24", NOW)).toBe("2026-10-19");
  });
});

describe("labels", () => {
  it("labels the first meeting as the kickoff", () => {
    expect(meetingTitle("2026-10-01")).toBe("Kickoff · Thu, Oct 1");
    expect(meetingTitle("2026-10-08")).toBe("Thu, Oct 8");
  });
  it("formats the date and time", () => {
    expect(meetingLabel("2026-10-22")).toBe("Thu, Oct 22");
    expect(meetingTimeLabel("16:30")).toBe("4:30 PM");
    expect(meetingTimeLabel("09:05")).toBe("9:05 AM");
    expect(meetingTimeLabel("12:00")).toBe("12:00 PM");
    expect(meetingTimeLabel("00:15")).toBe("12:15 AM");
  });
});
