import { describe, expect, it } from "vitest";
import { countableShipped, projectKey } from "./shipped";

const post = (
  member_id: string,
  project: string | null,
  created_at: string,
  category = "shipped",
) => ({ member_id, project, created_at, category });

describe("projectKey", () => {
  it("matches spelling variants of the same name", () => {
    expect(projectKey("C-art-ion")).toBe(projectKey("Cartion "));
    expect(projectKey("Muggy")).toBe(projectKey("muggy"));
  });

  it("groups unnamed projects together", () => {
    expect(projectKey(null)).toBe(projectKey(""));
  });
});

describe("countableShipped", () => {
  it("counts a member's project once, at its first shipped post", () => {
    const first = post("henry", "Muggy", "2026-10-09T00:00:00Z");
    const rows = [
      post("henry", "muggy", "2026-10-20T00:00:00Z"),
      first,
      post("henry", "Muggy!", "2026-10-15T00:00:00Z"),
    ];
    expect(countableShipped(rows)).toEqual([first]);
  });

  it("counts different projects, and the same project name for different members", () => {
    const rows = [
      post("henry", "Muggy", "2026-10-09T00:00:00Z"),
      post("henry", "Weatherly", "2026-10-12T00:00:00Z"),
      post("josh", "Muggy", "2026-10-10T00:00:00Z"),
    ];
    expect(countableShipped(rows)).toHaveLength(3);
  });

  it("ignores posts that aren't shipped", () => {
    const rows = [
      post("henry", "Muggy", "2026-10-09T00:00:00Z", "progress_update"),
    ];
    expect(countableShipped(rows)).toEqual([]);
  });
});
