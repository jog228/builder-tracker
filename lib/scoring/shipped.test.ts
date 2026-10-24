import { describe, expect, it } from "vitest";
import { buildAliasMap } from "./projects";
import {
  countableShipped,
  effectiveCategory,
  shippedCreditedTo,
} from "./shipped";

describe("effectiveCategory", () => {
  it("treats a candidate as progress until an exec says yes", () => {
    expect(effectiveCategory("shipped_candidate", null)).toBe(
      "progress_update",
    );
    expect(effectiveCategory("shipped_candidate", "pending")).toBe(
      "progress_update",
    );
    expect(effectiveCategory("shipped_candidate", "progress")).toBe(
      "progress_update",
    );
    expect(effectiveCategory("shipped_candidate", "shipped")).toBe("shipped");
  });

  it("lets an exec mark a post shipped that the model didn't flag", () => {
    expect(effectiveCategory("progress_update", "shipped")).toBe("shipped");
    expect(effectiveCategory("chatter", null)).toBe("chatter");
  });
});

const post = (
  member_id: string,
  project: string | null,
  created_at: string,
  category = "shipped",
) => ({ member_id, project, created_at, category });

describe("countableShipped", () => {
  it("counts a member's project once, at its first approved post", () => {
    const first = post("henry", "Muggy", "2026-10-09T00:00:00Z");
    const rows = [
      post("henry", "muggy", "2026-10-20T00:00:00Z"),
      first,
      post("henry", "Muggy!", "2026-10-15T00:00:00Z"),
    ];
    expect(countableShipped(rows)).toEqual([first]);
  });

  it("merges projects an admin has aliased", () => {
    const aliases = buildAliasMap([
      { member_id: "henry", alias: "weather outfit app", canonical: "Muggy" },
    ]);
    const rows = [
      post("henry", "weather outfit app", "2026-10-05T00:00:00Z"),
      post("henry", "Muggy", "2026-10-09T00:00:00Z"),
    ];
    expect(countableShipped(rows, aliases)).toHaveLength(1);
    expect(countableShipped(rows)).toHaveLength(2);
  });

  it("counts different projects, and the same name for different members", () => {
    const rows = [
      post("henry", "Muggy", "2026-10-09T00:00:00Z"),
      post("henry", "Weatherly", "2026-10-12T00:00:00Z"),
      post("josh", "Muggy", "2026-10-10T00:00:00Z"),
    ];
    expect(countableShipped(rows)).toHaveLength(3);
  });

  it("ignores posts that aren't approved as shipped", () => {
    expect(
      countableShipped([
        post("henry", "Muggy", "2026-10-09T00:00:00Z", "progress_update"),
      ]),
    ).toEqual([]);
  });
});

describe("shippedCreditedTo", () => {
  const ship = (id: string, project: string | null, created_at: string) => ({
    id,
    ...post("shen", project, created_at),
  });

  it("credits the first post per project and points duplicates at it", () => {
    const demo = ship("oct6", "Studlin", "2026-10-06T00:00:00Z");
    const link = ship("oct22", "Studlin", "2026-10-22T00:00:00Z");
    const credit = shippedCreditedTo([link, demo]);
    expect(credit.get("oct6")).toBeNull();
    expect(credit.get("oct22")).toBe(demo);
  });

  it("gives each project its own ship once the post is moved", () => {
    const credit = shippedCreditedTo([
      ship("oct6", "Studlin", "2026-10-06T00:00:00Z"),
      ship("oct22", "Campus Crush", "2026-10-22T00:00:00Z"),
    ]);
    expect(credit.get("oct6")).toBeNull();
    expect(credit.get("oct22")).toBeNull();
  });

  it("matches countableShipped through aliases and skips non-shipped posts", () => {
    const aliases = buildAliasMap([
      { member_id: "shen", alias: "lum", canonical: "Campus Crush" },
    ]);
    const first = ship("a", "Campus Crush", "2026-10-10T00:00:00Z");
    const rows = [
      first,
      ship("b", "lum", "2026-10-22T00:00:00Z"),
      {
        ...ship("c", "lum", "2026-10-01T00:00:00Z"),
        category: "progress_update",
      },
    ];
    const credit = shippedCreditedTo(rows, aliases);
    expect(credit.get("b")).toBe(first);
    expect(credit.has("c")).toBe(false);
    expect(countableShipped(rows, aliases)).toEqual([first]);
  });
});
