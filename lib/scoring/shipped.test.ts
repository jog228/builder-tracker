import { describe, expect, it } from "vitest";
import { buildAliasMap } from "./projects";
import { countableShipped, effectiveCategory } from "./shipped";

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
