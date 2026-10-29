import { describe, expect, it } from "vitest";
import {
  checkNewMeeting,
  meetingOptions,
  nextMeetingDate,
  optionLabel,
  resolveMeetingDate,
  timeLabel,
} from "./meeting-days";

// Thursday Oct 22, 2026, 3pm Eastern.
const NOW = new Date("2026-10-22T19:00:00Z");
const existing = ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"];

describe("nextMeetingDate", () => {
  it("is the Thursday after the latest meeting", () => {
    expect(nextMeetingDate("2026-10-22", NOW)).toBe("2026-10-29");
    expect(nextMeetingDate("2026-10-29", NOW)).toBe("2026-11-05");
  });
  it("from an off-day meeting, still lands on the next Thursday", () => {
    expect(nextMeetingDate("2026-10-27", NOW)).toBe("2026-10-29"); // Tue → Thu
  });
  it("is this week's Thursday when there are no meetings yet", () => {
    expect(nextMeetingDate(null, NOW)).toBe("2026-10-22");
  });
});

describe("meetingOptions", () => {
  it("lists season Thursdays up to this week, newest first", () => {
    expect(meetingOptions(existing, NOW).map((o) => o.date)).toEqual([
      "2026-10-22",
      "2026-10-15",
      "2026-10-08",
      "2026-10-01",
    ]);
  });
  it("adds future meetings (upcoming) and off-day ones", () => {
    const opts = meetingOptions([...existing, "2026-10-29", "2026-10-20"], NOW);
    expect(opts.map((o) => o.date)).toEqual([
      "2026-10-29",
      "2026-10-22",
      "2026-10-20",
      "2026-10-15",
      "2026-10-08",
      "2026-10-01",
    ]);
    expect(opts[0]).toMatchObject({
      upcoming: true,
      current: false,
      exists: true,
    });
    expect(opts[1]).toMatchObject({ upcoming: false, current: true });
    expect(optionLabel(opts[0])).toBe("Upcoming · Thu, Oct 29");
    expect(optionLabel(opts[1])).toBe("This week · Thu, Oct 22");
    expect(optionLabel(opts.at(-1)!)).toBe("Kickoff · Thu, Oct 1");
  });
  it("ignores meetings before the season", () => {
    expect(
      meetingOptions(["2026-09-24", ...existing], NOW).map((o) => o.date),
    ).not.toContain("2026-09-24");
  });
});

describe("resolveMeetingDate", () => {
  const opts = meetingOptions([...existing, "2026-10-29"], NOW);
  it("opens ?date= when offered, else this week", () => {
    expect(resolveMeetingDate({ date: "2026-10-29" }, opts, NOW)).toBe(
      "2026-10-29",
    );
    expect(resolveMeetingDate({ date: "2026-11-05" }, opts, NOW)).toBe(
      "2026-10-22",
    );
    expect(resolveMeetingDate({}, opts, NOW)).toBe("2026-10-22");
  });
  it("still understands older ?week= links", () => {
    expect(resolveMeetingDate({ week: "2026-10-05" }, opts, NOW)).toBe(
      "2026-10-08",
    );
  });
});

describe("checkNewMeeting", () => {
  it("accepts a free date in the season", () => {
    expect(
      checkNewMeeting({ date: "2026-10-29", time: "16:30" }, existing, NOW),
    ).toEqual({
      ok: true,
      date: "2026-10-29",
      time: "16:30",
    });
  });
  it("refuses a date that already has a meeting, pointing at it", () => {
    expect(
      checkNewMeeting({ date: "2026-10-22", time: "16:30" }, existing, NOW),
    ).toEqual({
      ok: false,
      status: 409,
      error: "There's already a meeting on Thu, Oct 22",
      conflictDate: "2026-10-22",
    });
  });
  it("refuses bad dates and times, pre-season and far-future dates", () => {
    for (const input of [
      { date: "2026-02-30", time: "16:30" },
      { date: "29/10/2026", time: "16:30" },
      { date: "2026-10-29", time: "4:30pm" },
      { date: "2026-10-29", time: "25:00" },
      { date: "2026-09-24", time: "16:30" },
      { date: "2027-06-01", time: "16:30" },
    ])
      expect(
        checkNewMeeting(input, existing, NOW),
        JSON.stringify(input),
      ).toMatchObject({
        ok: false,
        status: 400,
      });
  });
});

describe("timeLabel", () => {
  it("formats HH:MM and Postgres HH:MM:SS", () => {
    expect(timeLabel("16:30")).toBe("4:30 PM");
    expect(timeLabel("16:30:00")).toBe("4:30 PM");
    expect(timeLabel("09:05")).toBe("9:05 AM");
  });
});

describe("a week that already has a meeting on another day", () => {
  // Week of Oct 26: a Wednesday meeting exists; Thursday must not be added.
  const withWed = [...existing, "2026-10-28"];
  const WED_NOON = new Date("2026-10-28T16:00:00Z");
  const FRI = new Date("2026-10-30T16:00:00Z");

  it("offers that meeting instead of an extra Thursday", () => {
    for (const now of [NOW, WED_NOON, FRI]) {
      const dates = meetingOptions(withWed, now).map((o) => o.date);
      expect(dates).toContain("2026-10-28");
      expect(dates).not.toContain("2026-10-29");
    }
  });

  it("opens to it as this week's meeting", () => {
    const opts = meetingOptions(withWed, FRI);
    expect(opts.find((o) => o.current)?.date).toBe("2026-10-28");
    expect(resolveMeetingDate({}, opts, FRI)).toBe("2026-10-28");
    expect(resolveMeetingDate({ week: "2026-10-29" }, opts, FRI)).toBe(
      "2026-10-28",
    );
  });

  it("still offers the usual Thursday for weeks with no meeting", () => {
    const dates = meetingOptions(["2026-10-01"], NOW).map((o) => o.date);
    expect(dates).toEqual([
      "2026-10-22",
      "2026-10-15",
      "2026-10-08",
      "2026-10-01",
    ]);
  });
});

describe("a skipped week (meeting_skips)", () => {
  // Thu Oct 29 skipped, the meeting moved to Thu Nov 5. Today is Oct 29.
  const THU = new Date("2026-10-29T19:00:00Z");
  const moved = [...existing, "2026-11-05"];

  it("doesn't offer (or create) the skipped Thursday", () => {
    const dates = meetingOptions(moved, THU, { skipped: ["2026-10-29"] }).map(
      (o) => o.date,
    );
    expect(dates).toEqual([
      "2026-11-05",
      "2026-10-22",
      "2026-10-15",
      "2026-10-08",
      "2026-10-01",
    ]);
  });

  it("opens to the next upcoming meeting", () => {
    const opts = meetingOptions(moved, THU, { skipped: ["2026-10-29"] });
    expect(opts.some((o) => o.current)).toBe(false);
    expect(resolveMeetingDate({}, opts, THU)).toBe("2026-11-05");
    expect(optionLabel(opts[0])).toBe("Upcoming · Thu, Nov 5");
  });

  it("opens to the latest meeting when nothing is upcoming", () => {
    const opts = meetingOptions(existing, THU, { skipped: ["2026-10-29"] });
    expect(resolveMeetingDate({}, opts, THU)).toBe("2026-10-22");
  });

  it("an existing meeting on a skipped date is still shown", () => {
    const dates = meetingOptions([...existing, "2026-10-29"], THU, {
      skipped: ["2026-10-29"],
    }).map((o) => o.date);
    expect(dates).toContain("2026-10-29");
  });
});
