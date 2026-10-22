import { describe, expect, it } from "vitest";
import type { MeetingEvent } from "@/lib/attendance/meetings";
import { badgeMonthLabel, neverMissesMonths } from "./never-misses";

const builder = { active: true, exclude_from_rankings: false };
const exec = { active: true, exclude_from_rankings: true };
const week = (date: string): MeetingEvent => ({ date, weekly: true });
const october = ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"];
const meetings = october.map(week);
const TODAY = "2026-10-22";

describe("Never Misses", () => {
  it("4 of 4 meetings earns it for the month", () => {
    expect(neverMissesMonths(builder, meetings, october, TODAY)).toEqual([
      "2026-10",
    ]);
  });

  it("3 of 4 doesn't", () => {
    expect(
      neverMissesMonths(builder, meetings, october.slice(0, 3), TODAY),
    ).toEqual([]);
  });

  it("1 of 1 doesn't: at least 2 meetings must be held", () => {
    expect(
      neverMissesMonths(
        builder,
        [week("2026-10-01")],
        ["2026-10-01"],
        "2026-10-05",
      ),
    ).toEqual([]);
  });

  it("2 of 2 is enough", () => {
    expect(
      neverMissesMonths(
        builder,
        meetings,
        ["2026-10-01", "2026-10-08"],
        "2026-10-10", // Oct 15 and 22 haven't happened yet
      ),
    ).toEqual(["2026-10"]);
  });

  it("exec board members never get it, even at 100%", () => {
    expect(neverMissesMonths(exec, meetings, october, TODAY)).toEqual([]);
    expect(
      neverMissesMonths(
        { active: false, exclude_from_rankings: false },
        meetings,
        october,
        TODAY,
      ),
    ).toEqual([]);
  });

  it("is per month, and a later miss in the month takes it back", () => {
    const nov = [...meetings, week("2026-11-05"), week("2026-11-12")];
    const attended = [...october, "2026-11-05", "2026-11-12"];
    expect(neverMissesMonths(builder, nov, attended, "2026-11-13")).toEqual([
      "2026-10",
      "2026-11",
    ]);
    // Missed Nov 19: November is lost, October stays.
    expect(
      neverMissesMonths(
        builder,
        [...nov, week("2026-11-19")],
        attended,
        "2026-11-20",
      ),
    ).toEqual(["2026-10"]);
  });

  it("ignores future and pre-season meetings", () => {
    const withExtras = [week("2026-09-24"), ...meetings, week("2026-10-29")];
    expect(neverMissesMonths(builder, withExtras, october, TODAY)).toEqual([
      "2026-10",
    ]);
  });

  it("labels the month", () => {
    expect(badgeMonthLabel("2026-10")).toBe("Oct 2026");
  });
});
