import { describe, expect, it } from "vitest";
import type { MeetingEvent } from "@/lib/attendance/meetings";
import {
  badgeMonthLabel,
  badgeSync,
  neverMissesMonths,
  neverMissesThisMonth,
} from "./never-misses";

const builder = { active: true, exclude_from_rankings: false };
const exec = { active: true, exclude_from_rankings: true };
const week = (date: string): MeetingEvent => ({ date, weekly: true });
const october = ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"];
const meetings = october.map(week);
// October is over (and Oct 29 had no meeting), so October can be awarded.
const NOV = "2026-11-02";
const OCT_22 = "2026-10-22";

describe("Never Misses: completed months", () => {
  it("4 of 4 earns it once the month is over", () => {
    expect(neverMissesMonths(builder, meetings, october, NOV)).toEqual([
      "2026-10",
    ]);
  });

  it("3 of 4 doesn't", () => {
    expect(
      neverMissesMonths(builder, meetings, october.slice(0, 3), NOV),
    ).toEqual([]);
  });

  it("1 of 1 doesn't: at least 2 meetings must be held", () => {
    expect(
      neverMissesMonths(builder, [week("2026-10-01")], ["2026-10-01"], NOV),
    ).toEqual([]);
  });

  it("2 of 2 is enough", () => {
    expect(
      neverMissesMonths(
        builder,
        [week("2026-10-01"), week("2026-10-08")],
        ["2026-10-01", "2026-10-08"],
        NOV,
      ),
    ).toEqual(["2026-10"]);
  });

  it("exec board members never get it, even at 100%", () => {
    expect(neverMissesMonths(exec, meetings, october, NOV)).toEqual([]);
    expect(
      neverMissesMonths(
        { active: false, exclude_from_rankings: false },
        meetings,
        october,
        NOV,
      ),
    ).toEqual([]);
  });

  it("is never awarded for the month in progress", () => {
    expect(neverMissesMonths(builder, meetings, october, OCT_22)).toEqual([]);
  });

  it("ignores future and pre-season meetings", () => {
    const withExtras = [week("2026-09-24"), ...meetings, week("2026-11-05")];
    expect(neverMissesMonths(builder, withExtras, october, NOV)).toEqual([
      "2026-10",
    ]);
  });
});

describe("Never Misses: this month (the tile)", () => {
  it("is on track at 100% so far", () => {
    expect(neverMissesThisMonth(builder, meetings, october, OCT_22)).toEqual({
      attended: 4,
      held: 4,
      onTrack: true,
    });
  });
  it("isn't once a meeting is missed", () => {
    expect(
      neverMissesThisMonth(builder, meetings, october.slice(1), OCT_22),
    ).toEqual({ attended: 3, held: 4, onTrack: false });
  });
  it("isn't on track before any meeting this month has been held", () => {
    // November's first meeting is Nov 5; on Nov 2 none has happened yet.
    expect(
      neverMissesThisMonth(
        builder,
        [...meetings, week("2026-11-05")],
        october,
        NOV,
      ),
    ).toEqual({ attended: 0, held: 0, onTrack: false });
  });
  it("has no status for exec members", () => {
    expect(neverMissesThisMonth(exec, meetings, october, OCT_22)).toBeNull();
  });
});

describe("badgeSync", () => {
  const row = (member: string, period: string) => ({
    key: `${member}::${period}`,
    period,
  });

  it("adds newly earned completed months", () => {
    expect(badgeSync(new Set(["ana::2026-10"]), [], "2026-11")).toEqual({
      add: ["ana::2026-10"],
      remove: [],
    });
  });

  it("never revokes a completed month, even if it's no longer earned", () => {
    // e.g. attendance for October was corrected after the badge was awarded
    expect(badgeSync(new Set(), [row("ana", "2026-10")], "2026-11")).toEqual({
      add: [],
      remove: [],
    });
  });

  it("only clears premature rows for the current (or a future) month", () => {
    expect(
      badgeSync(
        new Set(),
        [row("ana", "2026-11"), row("bo", "2026-12"), row("cy", "2026-10")],
        "2026-11",
      ),
    ).toEqual({ add: [], remove: ["ana::2026-11", "bo::2026-12"] });
  });

  it("leaves once-ever badges alone", () => {
    expect(badgeSync(new Set(), [row("ana", "all")], "2026-11").remove).toEqual(
      [],
    );
  });
});

describe("badgeMonthLabel", () => {
  it("labels the month", () => {
    expect(badgeMonthLabel("2026-10")).toBe("Oct 2026");
  });
});
