import { describe, expect, it } from "vitest";
import {
  KnownProjects,
  buildAliasMap,
  projectKey,
  resolveProject,
} from "./projects";

const aliases = buildAliasMap([
  { member_id: "reid", alias: "site", canonical: "Vetted Network" },
  {
    member_id: "reid",
    alias: "vetted professional network",
    canonical: "Vetted Network",
  },
]);

describe("projectKey", () => {
  it("matches spelling variants and groups unnamed projects", () => {
    expect(projectKey("C-art-ion")).toBe(projectKey("Cartion "));
    expect(projectKey(null)).toBe(projectKey(""));
  });
});

describe("resolveProject", () => {
  it("applies a member's aliases, but only for that member", () => {
    expect(resolveProject("reid", "Site", aliases)).toBe("Vetted Network");
    expect(resolveProject("luke", "site", aliases)).toBe("site");
    expect(resolveProject("reid", null, aliases)).toBe(null);
  });
});

describe("KnownProjects", () => {
  it("only returns projects from earlier messages, deduped and alias-resolved", () => {
    const known = new KnownProjects(aliases);
    known.add("reid", "vetted professional network", "2026-10-09");
    known.add("reid", "Site", "2026-10-20");
    known.add("reid", "TikTok internships", "2026-10-01");
    known.add("luke", "widget", "2026-10-07");

    expect(known.before("reid", "2026-10-01")).toEqual([]);
    expect(known.before("reid", "2026-10-15")).toEqual([
      "TikTok internships",
      "Vetted Network",
    ]);
    expect(known.before("reid", "2026-10-21")).toEqual([
      "TikTok internships",
      "Vetted Network",
    ]);
    expect(known.before("luke", "2026-10-21")).toEqual(["widget"]);
  });
});
