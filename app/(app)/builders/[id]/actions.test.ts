// "Now Building" edits: only the profile's owner may save. Others (members,
// admins, signed-out visitors) get a 403 and never reach the database.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Viewer = { memberId: string; isAdmin: boolean; isExcluded: boolean };
const state = vi.hoisted(() => ({
  viewer: null as Viewer | null,
  calls: [] as {
    op: string;
    table: string;
    values: unknown;
    filter?: unknown;
  }[],
  /** Whether the owner already has a member_summaries row. */
  hasRow: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getViewer: async () => state.viewer }));
// A tiny fake of the bits of supabase-js the action uses; records each write.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      update: (values: unknown) => ({
        eq: (col: string, val: unknown) => ({
          select: async () => {
            state.calls.push({
              op: "update",
              table,
              values,
              filter: { [col]: val },
            });
            return {
              data: state.hasRow ? [{ member_id: val }] : [],
              error: null,
            };
          },
        }),
      }),
      insert: async (values: unknown) => {
        state.calls.push({ op: "insert", table, values });
        return { error: null };
      },
    }),
  }),
}));

const { saveNowBuilding } = await import("./actions");

const OWNER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const member = (id: string, o: Partial<Viewer> = {}): Viewer => ({
  memberId: id,
  isAdmin: false,
  isExcluded: false,
  ...o,
});

beforeEach(() => {
  state.viewer = null;
  state.calls = [];
  state.hasRow = true;
});

describe("saveNowBuilding", () => {
  it("lets the owner write their own summary, stamped as themselves", async () => {
    state.viewer = member(OWNER);
    await expect(
      saveNowBuilding(OWNER, "  Building Muggy:   the phone app is next. "),
    ).resolves.toEqual({ ok: true });
    expect(state.calls).toEqual([
      {
        op: "update",
        table: "member_summaries",
        values: {
          override_summary: "Building Muggy: the phone app is next.",
          override_by: OWNER,
        },
        filter: { member_id: OWNER },
      },
    ]);
  });

  it("creates the owner's row when they don't have one yet", async () => {
    state.viewer = member(OWNER);
    state.hasRow = false;
    await expect(
      saveNowBuilding(OWNER, "Starting a CLI tool."),
    ).resolves.toEqual({
      ok: true,
    });
    expect(state.calls.map((c) => c.op)).toEqual(["update", "insert"]);
    expect(state.calls[1].values).toEqual({
      member_id: OWNER,
      override_summary: "Starting a CLI tool.",
      override_by: OWNER,
    });
  });

  it("lets the owner reset to the auto-summary", async () => {
    state.viewer = member(OWNER);
    await expect(saveNowBuilding(OWNER, null)).resolves.toEqual({ ok: true });
    expect(state.calls).toEqual([
      {
        op: "update",
        table: "member_summaries",
        values: { override_summary: null, override_by: null },
        filter: { member_id: OWNER },
      },
    ]);
  });

  it.each([
    ["another member", member(OTHER), OWNER],
    ["an admin editing someone else", member(OTHER, { isAdmin: true }), OWNER],
    [
      "an exec board admin editing someone else",
      member(OTHER, { isAdmin: true, isExcluded: true }),
      OWNER,
    ],
    [
      "an exec board member on their own profile (no card)",
      member(OWNER, { isAdmin: true, isExcluded: true }),
      OWNER,
    ],
    ["a signed-out visitor", null, OWNER],
    ["a malformed id", member(OWNER), "not-a-uuid"],
  ])(
    "returns 403 for %s, without touching the database",
    async (_who, v, target) => {
      state.viewer = v;
      await expect(saveNowBuilding(target, "Edited")).resolves.toMatchObject({
        ok: false,
        status: 403,
      });
      expect(state.calls).toEqual([]);
    },
  );

  it("rejects overly long text", async () => {
    state.viewer = member(OWNER);
    await expect(
      saveNowBuilding(OWNER, "x".repeat(401)),
    ).resolves.toMatchObject({
      status: 400,
    });
    expect(state.calls).toEqual([]);
  });
});
