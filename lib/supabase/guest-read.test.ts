import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { readOnlyClient, GuestWriteBlocked } = await import("./guest-read");

/** A stand-in for supabase-js that records every call. */
function fakeDb() {
  const calls: string[] = [];
  const builder = (table: string) =>
    new Proxy(
      {},
      {
        get:
          (_t, m) =>
          (...args: unknown[]) => {
            calls.push(
              `${table}.${String(m)}(${JSON.stringify(args[0] ?? "")})`,
            );
            return builder(table);
          },
      },
    );
  const db = {
    from: (t: string) => builder(t),
    rpc: () => calls.push("rpc"),
    auth: { getUser: () => calls.push("auth") },
    storage: {},
  };
  return { db, calls };
}

describe("readOnlyClient (guest reads)", () => {
  it("allows select on the guest-visible tables", () => {
    const { db, calls } = fakeDb();
    const c = readOnlyClient(db as never);
    c.from("score_snapshots").select("member_id, total");
    expect(calls).toEqual(['score_snapshots.select("member_id, total")']);
  });

  it("has no write methods at all", () => {
    const { db, calls } = fakeDb();
    const q = readOnlyClient(db as never).from(
      "bonus_points",
    ) as unknown as Record<string, unknown>;
    for (const m of ["insert", "update", "upsert", "delete"])
      expect(q[m]).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("refuses other tables, rpc, auth and storage", () => {
    const { db, calls } = fakeDb();
    const c = readOnlyClient(db as never);
    expect(() => c.from("guest_login_attempts")).toThrow(GuestWriteBlocked);
    expect(() => c.from("sync_runs")).toThrow(GuestWriteBlocked);
    expect(() => c.rpc("anything")).toThrow(GuestWriteBlocked);
    expect(() => c.auth).toThrow(GuestWriteBlocked);
    expect(() => c.storage).toThrow(GuestWriteBlocked);
    expect(calls).toEqual([]);
  });
});
