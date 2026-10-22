import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { buildAliasMap } from "@/lib/scoring/projects";
import {
  NO_UPDATES_TEXT,
  PENDING_TEXT,
  buildSummaryRequest,
  cleanSummary,
  currentProject,
  nameIn,
  needsRegeneration,
  nowBuildingCard,
  parseSummaryResponse,
  redactNames,
  sourceUpdates,
  type ScoredUpdate,
  type SummaryRow,
} from "./now-building";

const builder = { active: true, exclude_from_rankings: false };
const exec = { active: true, exclude_from_rankings: true };
const inactive = { active: false, exclude_from_rankings: false };

const row = (o: Partial<SummaryRow> = {}): SummaryRow => ({
  project: "Muggy",
  summary: "Building Muggy, a weather app that suggests what to wear.",
  update_count: 3,
  last_post_at: "2026-10-17T15:00:00Z",
  generated_at: "2026-10-18T09:00:00Z",
  override_summary: null,
  override_by_name: null,
  override_at: null,
  ...o,
});

describe("nowBuildingCard: fallbacks", () => {
  it("with no updates, prompts them to post", () => {
    expect(nowBuildingCard(builder, null, false)).toEqual({
      kind: "empty",
      text: NO_UPDATES_TEXT,
      pending: false,
    });
    expect(NO_UPDATES_TEXT).toBe(
      "No updates yet: post your progress in GroupMe to fill this in.",
    );
  });
  it("with updates but no summary yet, says it's on the way", () => {
    expect(nowBuildingCard(builder, null, true)).toMatchObject({
      text: PENDING_TEXT,
      pending: true,
    });
    expect(
      nowBuildingCard(builder, row({ summary: null }), true),
    ).toMatchObject({
      pending: true,
    });
  });
  it("shows the generated summary with its counts", () => {
    expect(nowBuildingCard(builder, row(), true)).toMatchObject({
      kind: "summary",
      project: "Muggy",
      updateCount: 3,
      lastPostAt: "2026-10-17T15:00:00Z",
      edited: null,
    });
  });
  it("an admin override wins; a blank one falls back to generated", () => {
    const edited = nowBuildingCard(
      builder,
      row({
        override_summary: "Building Muggy.",
        override_by_name: "Jolie Goldstein",
        override_at: "2026-10-22T20:00:00Z",
      }),
      true,
    );
    expect(edited).toMatchObject({
      text: "Building Muggy.",
      generated: row().summary,
      edited: { by: "Jolie Goldstein", at: "2026-10-22T20:00:00Z" },
    });
    expect(
      nowBuildingCard(builder, row({ override_summary: "  " }), true),
    ).toMatchObject({ text: row().summary, edited: null });
  });
});

describe("nowBuildingCard: exec exclusion", () => {
  it("exec board members get no card, even with a summary row", () => {
    expect(nowBuildingCard(exec, row(), true)).toBeNull();
    expect(nowBuildingCard(exec, null, false)).toBeNull();
  });
  it("neither do inactive members", () => {
    expect(nowBuildingCard(inactive, row(), true)).toBeNull();
  });
});

const upd = (o: Partial<ScoredUpdate>): ScoredUpdate => ({
  id: "m1",
  createdAt: "2026-10-17T15:00:00Z",
  text: "Shipped the onboarding flow; next is notifications.",
  category: "progress_update",
  substance: 2,
  project: "Muggy",
  ...o,
});

describe("sourceUpdates", () => {
  it("keeps real updates from the 4 weeks before the latest, oldest first", () => {
    const src = sourceUpdates([
      upd({ id: "old", createdAt: "2026-09-10T15:00:00Z" }), // > 28 days before
      upd({ id: "b", createdAt: "2026-10-01T15:00:00Z" }),
      upd({
        id: "chatter",
        category: "chatter",
        createdAt: "2026-10-10T15:00:00Z",
      }),
      upd({ id: "zero", substance: 0, createdAt: "2026-10-11T15:00:00Z" }),
      upd({
        id: "help",
        category: "help_given",
        createdAt: "2026-10-12T15:00:00Z",
      }),
      upd({
        id: "shipped",
        category: "shipped",
        createdAt: "2026-10-14T15:00:00Z",
      }),
      upd({ id: "a", createdAt: "2026-10-17T15:00:00Z" }),
    ]);
    expect(src.map((u) => u.id)).toEqual(["b", "shipped", "a"]);
  });
  it("anchors on the latest update, so a quiet month still has a summary", () => {
    expect(
      sourceUpdates([upd({ createdAt: "2026-08-01T15:00:00Z" })]).length,
    ).toBe(1);
  });
  it("has nothing for a member with no real updates", () => {
    expect(sourceUpdates([upd({ substance: 0 })])).toEqual([]);
  });
});

describe("needsRegeneration", () => {
  const src = [upd({ id: "a" }), upd({ id: "b" })];
  it("only when there's an update the stored summary hasn't seen", () => {
    expect(needsRegeneration(null, src)).toBe(true);
    expect(needsRegeneration(["a", "b"], src)).toBe(false);
    expect(needsRegeneration(["x", "a", "b"], src)).toBe(false); // x aged out
    expect(needsRegeneration(["a"], src)).toBe(true);
    expect(needsRegeneration(null, [])).toBe(false);
  });
});

describe("currentProject", () => {
  it("uses the newest named project, with admin aliases", () => {
    const aliases = buildAliasMap([
      { member_id: "ana", alias: "muggy app", canonical: "Muggy" },
    ]);
    expect(
      currentProject(
        "ana",
        [
          upd({ project: "Old thing", createdAt: "2026-10-01T15:00:00Z" }),
          upd({ project: "Muggy App", createdAt: "2026-10-10T15:00:00Z" }),
          upd({ project: null, createdAt: "2026-10-17T15:00:00Z" }),
        ],
        aliases,
      ),
    ).toBe("Muggy");
  });
});

describe("names", () => {
  const names = ["Michael Kim", "Reid Sanders", "Amy"];
  it("redacts members' full names before sending", () => {
    expect(redactNames("Thanks Michael Kim and reid sanders!", names)).toBe(
      "Thanks [member] and [member]!",
    );
    const req = buildSummaryRequest(
      "Muggy",
      [upd({ text: "Paired with Michael Kim" })],
      names,
    );
    expect(JSON.stringify(req)).not.toMatch(/Michael Kim/);
  });
  it("finds full names and 4+ letter first names in output", () => {
    expect(nameIn("Building with Michael on the API.", names)).toBe("Michael");
    expect(nameIn("Building a dashboard.", names)).toBeNull();
    expect(nameIn("Reidsanders", names)).toBeNull();
  });
});

describe("cleanSummary", () => {
  it("keeps at most two sentences, drops exclamation marks", () => {
    expect(
      cleanSummary("Building Muggy! Added login.  Next: alerts. Also more."),
    ).toBe("Building Muggy. Added login.");
  });
  it("doesn't split on dots inside words", () => {
    expect(cleanSummary("Moving the app to Next.js and v2.0 of the API.")).toBe(
      "Moving the app to Next.js and v2.0 of the API.",
    );
  });
});

describe("parseSummaryResponse", () => {
  const res = (
    text: string,
    stop: Anthropic.Message["stop_reason"] = "end_turn",
  ) =>
    ({
      stop_reason: stop,
      content: [{ type: "text", text }],
    }) as unknown as Anthropic.Message;

  it("accepts a clean summary", () => {
    expect(
      parseSummaryResponse(
        res('{"summary":"Building Muggy, a weather app."}'),
        [],
      ),
    ).toEqual({ ok: true, summary: "Building Muggy, a weather app." });
  });
  it("rejects one that names a member", () => {
    expect(
      parseSummaryResponse(
        res('{"summary":"Building Muggy with Michael Kim."}'),
        ["Michael Kim"],
      ),
    ).toMatchObject({ ok: false });
  });
  it("rejects refusals and bad JSON", () => {
    expect(parseSummaryResponse(res("", "refusal"), [])).toMatchObject({
      ok: false,
    });
    expect(parseSummaryResponse(res("not json"), [])).toMatchObject({
      ok: false,
    });
  });
});
