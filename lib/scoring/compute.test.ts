import { dayLabel } from "@/lib/format";
import { describe, expect, it } from "vitest";
import type { BonusRow } from "./bonus";
import {
  computeScores,
  streakOf,
  type ScoredMessage,
  type ScoringInput,
} from "./compute";
import { buildAliasMap } from "./projects";

const NOW = new Date("2026-10-22T16:00:00Z"); // Thursday, October 2026

const members = [
  {
    id: "ana",
    groupmeUserId: "g-ana",
    active: true,
    exclude_from_rankings: false,
  },
  {
    id: "ben",
    groupmeUserId: "g-ben",
    active: true,
    exclude_from_rankings: false,
  },
  {
    id: "exec",
    groupmeUserId: "g-exec",
    active: true,
    exclude_from_rankings: true,
  },
];

const msg = (o: Partial<ScoredMessage>): ScoredMessage => ({
  member_id: "ana",
  created_at: "2026-10-14T15:00:00Z",
  category: "progress_update",
  approval: null,
  substance: 2,
  project: null,
  liked_by: [],
  ...o,
});

const input = (o: Partial<ScoringInput> = {}): ScoringInput => ({
  members,
  messages: [],
  attendance: [],
  github: [],
  bonuses: [],
  eventNames: new Map(),
  aliases: buildAliasMap([]),
  ...o,
});

const snap = (
  s: ReturnType<typeof computeScores>,
  member: string,
  period = "2026-10",
) => s.find((x) => x.member_id === member && x.period === period)!;

describe("computeScores", () => {
  it("works with no attendance or GitHub data and ranks everyone rankable", () => {
    const s = computeScores(input({ messages: [msg({})] }), NOW);
    expect(snap(s, "ana").total).toBe(10);
    expect(snap(s, "ana").rank).toBe(1);
    expect(snap(s, "ben").total).toBe(0);
    expect(snap(s, "ben").rank).toBe(2);
  });

  it("never produces a snapshot for an exec member", () => {
    const s = computeScores(
      input({
        messages: [
          msg({ member_id: "exec" }),
          msg({ member_id: "exec", substance: 3 }),
        ],
      }),
      NOW,
    );
    expect(s.some((x) => x.member_id === "exec")).toBe(false);
  });

  it("only counts progress updates with substance ≥ 2, capped at 80 a month", () => {
    const messages = [
      msg({ substance: 1 }),
      ...Array.from({ length: 12 }, (_, i) =>
        msg({ created_at: `2026-10-0${(i % 9) + 1}T15:00:00Z` }),
      ),
    ];
    const b = snap(computeScores(input({ messages }), NOW), "ana").components;
    expect(b.progress.count).toBe(12);
    expect(b.progress.points).toBe(80);
  });

  it("treats a shipped candidate as progress until an exec approves it", () => {
    const pending = msg({ category: "shipped_candidate", project: "Muggy" });
    const before = snap(
      computeScores(input({ messages: [pending] }), NOW),
      "ana",
    ).components;
    expect(before.progress.points).toBe(10);
    expect(before.shipped.points).toBe(0);

    const approved = { ...pending, approval: "shipped" as const };
    const after = snap(
      computeScores(input({ messages: [approved] }), NOW),
      "ana",
    ).components;
    expect(after.progress.points).toBe(0);
    expect(after.shipped.points).toBe(25);
  });

  it("counts an approved shipped project once, even when approved twice", () => {
    const messages = [
      msg({
        category: "shipped_candidate",
        approval: "shipped",
        project: "Studlin",
        created_at: "2026-10-06T15:00:00Z",
      }),
      msg({
        category: "shipped_candidate",
        approval: "shipped",
        project: "studlin",
        created_at: "2026-10-16T15:00:00Z",
      }),
    ];
    expect(
      snap(computeScores(input({ messages }), NOW), "ana").components.shipped
        .count,
    ).toBe(1);
  });

  it("counts likes on updates from anyone (execs included) but not self-likes", () => {
    const messages = [
      msg({ liked_by: ["g-ana", "g-ben", "g-exec", "g-outsider"] }),
      msg({ category: "chatter", liked_by: ["g-ben"] }), // likes on chatter don't count
    ];
    expect(
      snap(computeScores(input({ messages }), NOW), "ana").components.likes
        .count,
    ).toBe(3);
  });

  it("caps help at 25 a month", () => {
    const messages = Array.from({ length: 8 }, () =>
      msg({ category: "help_given" }),
    );
    expect(
      snap(computeScores(input({ messages }), NOW), "ana").components.help
        .points,
    ).toBe(25);
  });

  it("adds uncapped bonus points as their own line", () => {
    const bonus = (points: number, i: number): BonusRow => ({
      id: `b${i}`,
      member_id: "ana",
      event_id: null,
      type: "other",
      points,
      reason: "Helped run the workshop",
      awarded_at: "2026-10-10T00:00:00Z",
      revoked_at: null,
    });
    const b = snap(
      computeScores(input({ bonuses: [bonus(100, 1), bonus(150, 2)] }), NOW),
      "ana",
    ).components;
    expect(b.bonus.points).toBe(250);
    expect(b.bonus.lines[0].label).toBe("Helped run the workshop");
  });

  it("weights events and leaves them uncapped", () => {
    const attendance = Array.from({ length: 6 }, (_, i) => ({
      member_id: "ana",
      date: `2026-10-0${i + 1}`,
      weight: i === 0 ? 2 : 1,
    }));
    expect(
      snap(computeScores(input({ attendance }), NOW), "ana").components.events
        .points,
    ).toBe(15 * 7);
  });

  describe("a demo entered today for a past meeting", () => {
    const demo = (o: Partial<BonusRow>): BonusRow => ({
      id: "d1",
      member_id: "ana",
      event_id: "oct-8",
      event_date: "2026-10-08",
      type: "demo",
      points: 30,
      reason: "Demoed at Weekly Meeting (2026-10-08)",
      awarded_at: "2026-10-22T19:05:00Z", // entered today via the week picker
      revoked_at: null,
      ...o,
    });
    const names = new Map([["oct-8", "Weekly Meeting"]]);

    it("displays as the Oct 8 meeting, not the entry date", () => {
      const line = snap(
        computeScores(input({ bonuses: [demo({})], eventNames: names }), NOW),
        "ana",
      ).components.bonus.lines[0];
      expect(line).toMatchObject({
        label: "Demoed at Weekly Meeting",
        date: "2026-10-08",
        awardedAt: "2026-10-22T19:05:00Z",
      });
      expect(dayLabel(line.date)).toBe("Oct 8");
    });

    it("scores in the meeting's month even when entered the next month", () => {
      // Entered Nov 3 for the Oct 29 meeting: October points, not November.
      const nov = new Date("2026-11-03T17:00:00Z");
      const s = computeScores(
        input({
          bonuses: [
            demo({
              event_date: "2026-10-29",
              awarded_at: "2026-11-03T16:00:00Z",
            }),
          ],
          eventNames: names,
        }),
        nov,
      );
      expect(snap(s, "ana", "2026-11").components.bonus.points).toBe(0);
      expect(snap(s, "ana", "all").components.bonus.points).toBe(30);
    });

    it("falls back to awarded_at only for bonuses without an event", () => {
      const s = computeScores(
        input({
          bonuses: [
            demo({
              type: "other",
              event_id: null,
              event_date: null,
              awarded_at: "2026-10-22T19:05:00Z",
            }),
          ],
        }),
        NOW,
      );
      expect(snap(s, "ana").components.bonus.lines[0].date).toBe(
        "2026-10-22T19:05:00Z",
      );
    });
  });

  it("counts back-filled weekly meetings in the meeting's month", () => {
    // Oct 1 (kickoff), 8 and 15 entered late still score in October, by the
    // meeting date. A September 24 meeting counts only toward all-time.
    const attendance = [
      "2026-10-01",
      "2026-10-08",
      "2026-10-15",
      "2026-09-24",
    ].map((date) => ({ member_id: "ana", date, weight: 1 }));
    const s = computeScores(input({ attendance }), NOW);
    expect(snap(s, "ana").components.events).toMatchObject({
      count: 3,
      points: 45,
    });
    expect(snap(s, "ana", "all").components.events.count).toBe(4);
  });

  it("all-time sums each month's capped points", () => {
    const messages = [
      ...Array.from({ length: 10 }, () =>
        msg({ created_at: "2026-09-20T15:00:00Z" }),
      ),
      ...Array.from({ length: 10 }, () =>
        msg({ created_at: "2026-10-14T15:00:00Z" }),
      ),
    ];
    const s = computeScores(input({ messages }), NOW);
    expect(snap(s, "ana").components.progress.points).toBe(80);
    expect(snap(s, "ana", "all").components.progress.points).toBe(160);
  });
});

describe("streaks", () => {
  it("awards +5 for each week that continues a streak, and tracks the current run", () => {
    const messages = [
      msg({ created_at: "2026-10-05T15:00:00Z" }), // week of Oct 5
      msg({ created_at: "2026-10-13T15:00:00Z" }), // week of Oct 12
      msg({ created_at: "2026-10-19T15:00:00Z" }), // week of Oct 19
    ];
    const b = snap(computeScores(input({ messages }), NOW), "ana").components;
    expect(b.streak.count).toBe(2);
    expect(b.streak.points).toBe(10);
    expect(b.streak_weeks).toEqual({ current: 3, longest: 3 });
  });

  it("keeps the streak alive through the current week, then breaks it", () => {
    const weeks = new Set(["2026-10-05", "2026-10-12"]);
    expect(streakOf(weeks, new Date("2026-10-21T12:00:00Z")).current).toBe(2); // Oct 19 week, no post yet
    expect(streakOf(weeks, new Date("2026-10-28T12:00:00Z")).current).toBe(0); // missed Oct 19 week
  });
});
