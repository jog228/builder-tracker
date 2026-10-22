import { describe, expect, it } from "vitest";
import { dayLabel } from "./format";

describe("dayLabel", () => {
  it("reads a plain date as that calendar day, not UTC midnight", () => {
    expect(dayLabel("2026-10-08")).toBe("Oct 8");
    expect(dayLabel("2026-10-01")).toBe("Oct 1");
  });
  it("reads timestamps in club time", () => {
    // 1am UTC on Oct 23 is still Oct 22 in Eastern time.
    expect(dayLabel("2026-10-23T01:00:00Z")).toBe("Oct 22");
  });
});
