import { describe, expect, it, vi } from "vitest";
import { BONUS } from "@/lib/scoring/config";
import { applyCheckin, type CheckinRow, type CheckinStore } from "./checkin";

const EVENT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const EXEC = "33333333-3333-4333-8333-333333333333";
const ADMIN = {
  memberId: "44444444-4444-4444-8444-444444444444",
  isAdmin: true,
};

/** In-memory store with spies on every write. */
function fakeStore(initial: Partial<CheckinRow> = {}) {
  const row: CheckinRow = {
    present: false,
    demoId: null,
    recordedBy: null,
    recordedAt: null,
    ...initial,
  };
  const store = {
    getEvent: vi.fn(async (id: string) =>
      id === EVENT
        ? { id, name: "Weekly Meeting", date: "2026-10-22", weekly: true }
        : null,
    ),
    getMember: vi.fn(async (id: string) =>
      id === MEMBER
        ? { active: true, excluded: false }
        : id === EXEC
          ? { active: true, excluded: true }
          : null,
    ),
    getRow: vi.fn(async () => ({ ...row })),
    markPresent: vi.fn(async (_e: string, _m: string, by: string) => {
      Object.assign(row, { present: true, recordedBy: by, recordedAt: "now" });
    }),
    unmarkPresent: vi.fn(async () => {
      Object.assign(row, {
        present: false,
        recordedBy: null,
        recordedAt: null,
      });
    }),
    awardDemo: vi.fn(async () => {
      Object.assign(row, { demoId: "demo-1", present: true });
    }),
    revokeDemo: vi.fn(async () => {
      row.demoId = null;
    }),
  } satisfies CheckinStore;
  const writes = () =>
    store.markPresent.mock.calls.length +
    store.unmarkPresent.mock.calls.length +
    store.awardDemo.mock.calls.length +
    store.revokeDemo.mock.calls.length;
  return { store, writes };
}

const present = { present: true, demo: false };

describe("applyCheckin authorization (server layer)", () => {
  it("returns 403 for a non-admin and never touches the store", async () => {
    const { store, writes } = fakeStore();
    const res = await applyCheckin(
      { memberId: MEMBER, isAdmin: false },
      store,
      { eventId: EVENT, memberId: MEMBER, target: present },
    );
    expect(res).toMatchObject({ ok: false, status: 403 });
    expect(writes()).toBe(0);
    expect(store.getEvent).not.toHaveBeenCalled();
  });

  it("returns 403 when signed out", async () => {
    const { store, writes } = fakeStore();
    const res = await applyCheckin(null, store, {
      eventId: EVENT,
      memberId: MEMBER,
      target: present,
    });
    expect(res).toMatchObject({ ok: false, status: 403 });
    expect(writes()).toBe(0);
  });

  it("refuses to mark an exec board member present (or demoed)", async () => {
    for (const target of [present, { present: true, demo: true }]) {
      const { store, writes } = fakeStore();
      const res = await applyCheckin(ADMIN, store, {
        eventId: EVENT,
        memberId: EXEC,
        target,
      });
      expect(res).toMatchObject({ ok: false, status: 409 });
      expect(writes()).toBe(0);
    }
  });

  it("rejects malformed ids and unknown meetings", async () => {
    const { store, writes } = fakeStore();
    expect(
      await applyCheckin(ADMIN, store, {
        eventId: "x",
        memberId: MEMBER,
        target: present,
      }),
    ).toMatchObject({ status: 400 });
    expect(
      await applyCheckin(ADMIN, store, {
        eventId: "55555555-5555-4555-8555-555555555555",
        memberId: MEMBER,
        target: present,
      }),
    ).toMatchObject({ status: 404 });
    expect(writes()).toBe(0);
  });
});

describe("applyCheckin reconciliation", () => {
  it("marks present as the admin", async () => {
    const { store } = fakeStore();
    const res = await applyCheckin(ADMIN, store, {
      eventId: EVENT,
      memberId: MEMBER,
      target: present,
    });
    expect(res).toMatchObject({
      ok: true,
      row: { present: true, recordedBy: ADMIN.memberId },
    });
    expect(store.markPresent).toHaveBeenCalledWith(
      EVENT,
      MEMBER,
      ADMIN.memberId,
    );
  });

  it("a demo awards the configured points and implies present", async () => {
    const { store } = fakeStore();
    await applyCheckin(ADMIN, store, {
      eventId: EVENT,
      memberId: MEMBER,
      target: { present: false, demo: true },
    });
    expect(store.markPresent).toHaveBeenCalled();
    expect(store.awardDemo).toHaveBeenCalledWith(
      EVENT,
      MEMBER,
      ADMIN.memberId,
      BONUS.demoPoints,
      expect.stringContaining("Weekly Meeting"),
    );
  });

  it("un-marking present also revokes the demo", async () => {
    const { store } = fakeStore({ present: true, demoId: "demo-1" });
    const res = await applyCheckin(ADMIN, store, {
      eventId: EVENT,
      memberId: MEMBER,
      target: { present: false, demo: false },
    });
    expect(store.revokeDemo).toHaveBeenCalledWith("demo-1", ADMIN.memberId);
    expect(store.unmarkPresent).toHaveBeenCalled();
    expect(res).toMatchObject({
      ok: true,
      row: { present: false, demoId: null },
    });
  });

  it("turning a demo off keeps them present", async () => {
    const { store } = fakeStore({ present: true, demoId: "demo-1" });
    await applyCheckin(ADMIN, store, {
      eventId: EVENT,
      memberId: MEMBER,
      target: present,
    });
    expect(store.revokeDemo).toHaveBeenCalled();
    expect(store.unmarkPresent).not.toHaveBeenCalled();
  });

  it("is idempotent", async () => {
    const { store, writes } = fakeStore({ present: true });
    await applyCheckin(ADMIN, store, {
      eventId: EVENT,
      memberId: MEMBER,
      target: present,
    });
    expect(writes()).toBe(0);
  });
});
