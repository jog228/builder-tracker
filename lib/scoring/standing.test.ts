import { describe, expect, it } from "vitest";
import {
  MIN_BAR_PCT,
  barPercent,
  standing,
  standingText,
  type RankedEntry,
} from "./standing";

const e = (memberId: string, total: number): RankedEntry => ({
  memberId,
  name: memberId.toUpperCase(),
  total,
});
const board = [
  e("sh", 154),
  e("th", 146),
  e("he", 118),
  e("mi", 103),
  e("re", 91),
];

describe("standing", () => {
  it("the leader leads by the gap to #2", () => {
    expect(standing(board, "sh")).toEqual({ kind: "leader", leadBy: 8 });
    expect(standingText(standing(board, "sh")!)).toBe("#1 — leading by 8 pts");
  });

  it("everyone else needs the gap to the next builder up, plus one", () => {
    expect(standing(board, "th")).toEqual({
      kind: "chasing",
      toPass: 9,
      name: "SH",
    });
    expect(standing(board, "re")).toEqual({
      kind: "chasing",
      toPass: 13,
      name: "MI",
    });
    expect(standingText(standing(board, "he")!)).toBe("29 pts to pass TH");
  });

  it("passing someone you're tied with takes 1 point", () => {
    const b = [e("a", 50), e("b", 40), e("c", 40)];
    expect(standing(b, "c")).toEqual({
      kind: "chasing",
      toPass: 11,
      name: "A",
    });
    expect(standingText({ kind: "chasing", toPass: 1, name: "B" })).toBe(
      "1 pt to pass B",
    );
  });

  it("handles a tie for #1, including everyone at 0", () => {
    expect(standing([e("a", 30), e("b", 30), e("c", 5)], "a")).toEqual({
      kind: "tied-first",
      with: ["B"],
    });
    const zeros = [e("a", 0), e("b", 0), e("c", 0)];
    expect(standingText(standing(zeros, "a")!)).toBe(
      "#1 — tied with B and 1 other",
    );
  });

  it("a lone builder leads by their own total", () => {
    expect(standing([e("a", 12)], "a")).toEqual({ kind: "leader", leadBy: 12 });
  });

  it("is null for someone not in the ranking (exec board)", () => {
    expect(standing(board, "exec")).toBeNull();
  });
});

describe("barPercent (leaderboard bars, relative to #1)", () => {
  it("fills the leader's bar completely", () => {
    expect(barPercent(154, 154)).toBe(100);
  });
  it("is points ÷ the leader's points for everyone else", () => {
    expect(barPercent(77, 154)).toBe(50);
    expect(barPercent(146, 154)).toBeCloseTo(94.81, 2);
  });
  it("gives low scores a small minimum width", () => {
    expect(barPercent(1, 154)).toBe(MIN_BAR_PCT);
    expect(barPercent(2, 154)).toBe(MIN_BAR_PCT);
  });
  it("is empty for 0 points, and when everyone has 0 (no divide by zero)", () => {
    expect(barPercent(0, 154)).toBe(0);
    expect(barPercent(0, 0)).toBe(0);
    expect(Number.isFinite(barPercent(5, 0))).toBe(true);
  });
});
