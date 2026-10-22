import { describe, expect, it } from "vitest";
import { STREAK_MIN_SUBSTANCE, UPDATE_MIN_SUBSTANCE, WEIGHTS } from "./config";
import {
  countsForStreak,
  earnsProgressPoints,
  isUpdate,
  updatePoints,
} from "./updates";

const progress = (substance: number) => ({
  category: "progress_update",
  substance,
});

describe("thresholds", () => {
  it("are 1 for points and 2 for streaks, and feed the weights", () => {
    expect(UPDATE_MIN_SUBSTANCE).toBe(1);
    expect(STREAK_MIN_SUBSTANCE).toBe(2);
    expect(WEIGHTS.progressUpdate.minSubstance).toBe(UPDATE_MIN_SUBSTANCE);
    expect(WEIGHTS.streakWeek.minSubstance).toBe(STREAK_MIN_SUBSTANCE);
  });
});

describe("per-update rules", () => {
  it.each([
    [0, 0, false],
    [1, 10, false],
    [2, 10, true],
    [3, 10, true],
  ])("substance %i: +%i points, streak %s", (substance, points, streak) => {
    expect(updatePoints(progress(substance))).toBe(points);
    expect(earnsProgressPoints(progress(substance))).toBe(points > 0);
    expect(countsForStreak(progress(substance))).toBe(streak);
  });

  it("chatter never scores or counts for a streak", () => {
    const chatter = { category: "chatter", substance: 3 };
    expect(updatePoints(chatter)).toBe(0);
    expect(countsForStreak(chatter)).toBe(false);
    expect(isUpdate(chatter)).toBe(false);
  });

  it("shipped and help posts show their own points", () => {
    expect(updatePoints({ category: "shipped", substance: 2 })).toBe(25);
    expect(countsForStreak({ category: "shipped", substance: 2 })).toBe(true);
    expect(updatePoints({ category: "help_given", substance: 1 })).toBe(5);
    expect(isUpdate({ category: "help_given" })).toBe(false);
  });
});
