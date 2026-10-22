import { describe, expect, it } from "vitest";
import { rankMembers, type RankInput } from "./rank";

const member = (id: string, overrides: Partial<RankInput> = {}): RankInput => ({
  id,
  active: true,
  exclude_from_rankings: false,
  ...overrides,
});

describe("rankMembers", () => {
  it("never ranks an excluded (exec board) member, even with the top score", () => {
    const members = [
      member("alice"),
      member("exec", { exclude_from_rankings: true }),
      member("bob"),
    ];
    const totals = new Map([
      ["alice", 50],
      ["exec", 999],
      ["bob", 20],
    ]);

    const ranked = rankMembers(members, totals);

    expect(ranked.map((r) => r.memberId)).not.toContain("exec");
    expect(ranked).toEqual([
      { memberId: "alice", total: 50, rank: 1 },
      { memberId: "bob", total: 20, rank: 2 },
    ]);
  });

  it("drops an excluded member who has no score at all", () => {
    const ranked = rankMembers(
      [member("exec", { exclude_from_rankings: true })],
      new Map(),
    );
    expect(ranked).toEqual([]);
  });

  it("drops inactive members", () => {
    const ranked = rankMembers(
      [member("gone", { active: false }), member("here")],
      new Map([["gone", 10]]),
    );
    expect(ranked.map((r) => r.memberId)).toEqual(["here"]);
  });

  it("gives tied members the same rank and skips the next", () => {
    const ranked = rankMembers(
      [member("a"), member("b"), member("c"), member("d")],
      new Map([
        ["a", 30],
        ["b", 20],
        ["c", 20],
        ["d", 10],
      ]),
    );
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });
});
