import { describe, expect, it } from "vitest";
import {
  bonusComponent,
  bonusDate,
  countableBonuses,
  demoCount,
  earnsDemoDayBadge,
  type BonusRow,
} from "./bonus";
import { BONUS } from "./config";

const members = new Map([
  ["ana", { active: true, exclude_from_rankings: false }],
  ["ben", { active: true, exclude_from_rankings: false }],
  ["exec", { active: true, exclude_from_rankings: true }],
]);

let n = 0;
const award = (overrides: Partial<BonusRow>): BonusRow => ({
  id: `b${++n}`,
  member_id: "ana",
  event_id: "hack-night",
  type: "demo",
  points: BONUS.demoPoints,
  reason: "Demoed",
  awarded_at: `2026-10-${String(10 + n).padStart(2, "0")}T00:00:00Z`,
  revoked_at: null,
  ...overrides,
});

describe("countableBonuses", () => {
  it("counts a demo once per member per event", () => {
    const first = award({});
    const rows = [
      first,
      award({}), // same member, same event
      award({ event_id: "workshop" }), // same member, different event
      award({ member_id: "ben" }), // different member, same event
    ];
    const counted = countableBonuses(rows, members);
    expect(counted).toHaveLength(3);
    expect(counted).toContain(first);
  });

  it("never gives an exec board member a bonus", () => {
    const rows = [
      award({ member_id: "exec" }),
      award({
        member_id: "exec",
        type: "other",
        event_id: null,
        reason: "Ran the workshop",
      }),
    ];
    expect(countableBonuses(rows, members)).toEqual([]);
  });

  it("ignores revoked awards, and a revoked demo doesn't block a re-award", () => {
    const revoked = award({ revoked_at: "2026-10-20T00:00:00Z" });
    const reAward = award({});
    expect(countableBonuses([revoked, reAward], members)).toEqual([reAward]);
  });

  it("allows several 'other' bonuses, with or without an event", () => {
    const rows = [
      award({
        type: "other",
        event_id: null,
        reason: "Helped run the workshop",
        points: 20,
      }),
      award({
        type: "other",
        event_id: null,
        reason: "Mentored a team",
        points: 15,
      }),
    ];
    expect(countableBonuses(rows, members)).toHaveLength(2);
  });
});

describe("bonusComponent", () => {
  it("is uncapped, uses overridden amounts, and labels each line", () => {
    const counted = countableBonuses(
      [
        award({}),
        award({ event_id: "demo-day", points: 50 }),
        award({
          type: "other",
          event_id: null,
          reason: "Helped run the workshop",
          points: 200,
        }),
      ],
      members,
    );
    const { total, lines } = bonusComponent(
      counted,
      new Map([["hack-night", "Hack Night"]]),
    );
    expect(total).toBe(30 + 50 + 200);
    expect(lines.map((l) => `${l.label} +${l.points}`)).toEqual([
      "Demoed at Hack Night +30",
      "Demoed at an event +50",
      "Helped run the workshop +200",
    ]);
    expect(lines.map((l) => l.type)).toEqual(["demo", "demo", "other"]);
  });
});

describe("bonusDate", () => {
  it("uses the event's date when there is one, else awarded_at", () => {
    expect(
      bonusDate({
        event_date: "2026-10-08",
        awarded_at: "2026-10-22T19:05:00Z",
      }),
    ).toBe("2026-10-08");
    expect(
      bonusDate({ event_date: null, awarded_at: "2026-10-22T19:05:00Z" }),
    ).toBe("2026-10-22T19:05:00Z");
  });
});

describe("Demo Day badge", () => {
  it("needs demos at 3 different events", () => {
    const counted = countableBonuses(
      [
        award({ event_id: "e1" }),
        award({ event_id: "e1" }), // duplicate, doesn't count
        award({ event_id: "e2" }),
      ],
      members,
    );
    expect(demoCount(counted, "ana")).toBe(2);
    expect(earnsDemoDayBadge(2)).toBe(false);
    expect(earnsDemoDayBadge(3)).toBe(true);
  });
});

describe("community points in the bonus line", () => {
  const c = (id: string, points: number, at: string, by = "jo"): BonusRow => ({
    id,
    member_id: "ana",
    event_id: null,
    type: "community",
    points,
    reason: "Instagram feature",
    awarded_at: at,
    revoked_at: null,
    awarded_by: by,
  });
  it("counts at most 20 a month, oldest first, and names who awarded it", () => {
    const { total, lines } = bonusComponent(
      [
        c("a", 10, "2026-10-02T15:00:00Z"),
        c("b", 10, "2026-10-09T15:00:00Z"),
        c("c", 5, "2026-10-16T15:00:00Z"), // past the cap: dropped
      ],
      new Map(),
      new Map([["jo", "Jolie Goldstein"]]),
    );
    expect(total).toBe(20);
    expect(lines.map((l) => [l.label, l.points, l.by])).toEqual([
      ["Instagram feature", 10, "Jolie Goldstein"],
      ["Instagram feature", 10, "Jolie Goldstein"],
    ]);
  });
  it("doesn't cap demo or other bonuses", () => {
    const { total } = bonusComponent(
      [
        c("a", 10, "2026-10-02T15:00:00Z"),
        { ...c("d", 30, "2026-10-08T15:00:00Z"), type: "demo", event_id: "e1" },
        { ...c("o", 50, "2026-10-09T15:00:00Z"), type: "other" },
      ],
      new Map([["e1", "Weekly Meeting"]]),
    );
    expect(total).toBe(90);
  });
});
