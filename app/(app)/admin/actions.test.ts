// Admin-only server actions return 403 for non-admins and never reach the
// database. (The pages are guarded separately; see lib/access.test.ts.)
import { beforeEach, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({
  current: null as null | { isAdmin: boolean; memberId: string },
}));
const dbTouched = vi.hoisted(() => ({ count: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/scoring/recompute", () => ({ scheduleRecompute: vi.fn() }));
vi.mock("@/lib/scoring/compute-scores", () => ({
  computeAndSaveScores: vi.fn(),
}));
const db = () =>
  new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return undefined; // so `await createClient()` works
        dbTouched.count++;
        throw new Error("database touched");
      },
    },
  );
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db() }));
vi.mock("@/lib/auth", async (orig) => {
  const real = await orig<typeof import("@/lib/auth")>();
  return {
    ...real,
    getViewer: async () => viewer.current,
    getAdmin: async () => (viewer.current?.isAdmin ? viewer.current : null),
  };
});

const { decideShipped, flagShipped, reopenShipped } = await import("./actions");
const { createMeeting, setCheckin, skipMeeting, unskipMeeting } =
  await import("./checkin/actions");

const EVENT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

describe.each([
  ["a regular member", { isAdmin: false, memberId: MEMBER }],
  ["a signed-out visitor", null],
])("for %s", (_who, v) => {
  beforeEach(() => {
    viewer.current = v;
    dbTouched.count = 0;
  });

  it.each([
    ["decideShipped", () => decideShipped("123", "shipped")],
    ["reopenShipped", () => reopenShipped("123")],
    ["flagShipped", () => flagShipped("123")],
    [
      "setCheckin",
      () => setCheckin(EVENT, MEMBER, { present: true, demo: false }),
    ],
    ["createMeeting", () => createMeeting("2026-11-12", "16:30")],
    ["skipMeeting", () => skipMeeting("2026-11-05", "", true)],
    ["unskipMeeting", () => unskipMeeting("2026-10-29")],
  ])("%s returns 403 without touching the database", async (_name, call) => {
    await expect(call()).resolves.toMatchObject({ ok: false, status: 403 });
    expect(dbTouched.count).toBe(0);
  });
});
