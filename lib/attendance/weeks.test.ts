import { describe, expect, it } from "vitest";
import {
  meetingDate,
  meetingLabel,
  meetingTimeLabel,
  pickerWeeks,
  resolveWeek,
} from "./weeks";

// Thursday Oct 22 2026, 9pm Eastern (already Friday in UTC).
const NOW = new Date("2026-10-23T01:00:00Z");

describe("meetingDate", () => {
  it("puts the meeting on the configured weekday of that week", () => {
    expect(meetingDate("2026-10-19")).toBe("2026-10-22");
    expect(meetingDate("2026-12-28")).toBe("2026-12-31");
  });
});

describe("pickerWeeks", () => {
  it("starts at this club-time week and goes back 12 weeks", () => {
    const weeks = pickerWeeks(NOW);
    expect(weeks[0]).toBe("2026-10-19");
    expect(weeks[1]).toBe("2026-10-12");
    expect(weeks).toHaveLength(12);
  });
});

describe("resolveWeek", () => {
  it("defaults to this week", () => {
    expect(resolveWeek(undefined, NOW)).toBe("2026-10-19");
    expect(resolveWeek("garbage", NOW)).toBe("2026-10-19");
  });
  it("accepts any day of a recent week", () => {
    expect(resolveWeek("2026-10-08", NOW)).toBe("2026-10-05");
  });
  it("rejects future and too-old weeks", () => {
    expect(resolveWeek("2026-10-26", NOW)).toBe("2026-10-19");
    expect(resolveWeek("2026-01-05", NOW)).toBe("2026-10-19");
  });
});

describe("labels", () => {
  it("formats the date and time", () => {
    expect(meetingLabel("2026-10-22")).toBe("Thu, Oct 22");
    expect(meetingTimeLabel("16:30")).toBe("4:30 PM");
    expect(meetingTimeLabel("09:05")).toBe("9:05 AM");
    expect(meetingTimeLabel("12:00")).toBe("12:00 PM");
    expect(meetingTimeLabel("00:15")).toBe("12:15 AM");
  });
});
