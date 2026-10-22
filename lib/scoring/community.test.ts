import { describe, expect, it } from "vitest";
import { checkCommunityAward, communityUsed, OTHER_REASON } from "./community";

const admin = { memberId: "jo", isAdmin: true };
const builder = { id: "ana", active: true, exclude_from_rankings: false };
const award = (
  o: Partial<{ amount: number; reason: string; otherText: string }> = {},
) => ({
  amount: 5,
  reason: "Instagram feature",
  ...o,
});

describe("checkCommunityAward", () => {
  it("lets an admin award a preset amount with a preset reason", () => {
    expect(checkCommunityAward(admin, builder, award(), 0)).toEqual({
      ok: true,
      points: 5,
      reason: "Instagram feature",
    });
    expect(
      checkCommunityAward(admin, builder, award({ amount: 10 }), 10),
    ).toMatchObject({
      ok: true,
      points: 10,
    });
  });

  it("returns 403 for non-admins and signed-out visitors", () => {
    expect(
      checkCommunityAward(
        { memberId: "bo", isAdmin: false },
        builder,
        award(),
        0,
      ),
    ).toMatchObject({ ok: false, status: 403 });
    expect(checkCommunityAward(null, builder, award(), 0)).toMatchObject({
      status: 403,
    });
  });

  it("returns 403 for an admin awarding themselves", () => {
    expect(
      checkCommunityAward(admin, { ...builder, id: "jo" }, award(), 0),
    ).toMatchObject({ status: 403 });
  });

  it("refuses exec board (and inactive) members", () => {
    expect(
      checkCommunityAward(
        admin,
        { ...builder, exclude_from_rankings: true },
        award(),
        0,
      ),
    ).toMatchObject({ ok: false, status: 409 });
    expect(
      checkCommunityAward(admin, { ...builder, active: false }, award(), 0),
    ).toMatchObject({ status: 409 });
  });

  it("enforces the 20/month cap", () => {
    expect(
      checkCommunityAward(admin, builder, award({ amount: 5 }), 15),
    ).toMatchObject({
      ok: true,
    });
    expect(
      checkCommunityAward(admin, builder, award({ amount: 10 }), 15),
    ).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(
      checkCommunityAward(admin, builder, award({ amount: 5 }), 20),
    ).toMatchObject({
      status: 409,
    });
  });

  it("only allows +5 and +10", () => {
    for (const amount of [0, 1, 7, 15, 20, -5])
      expect(
        checkCommunityAward(admin, builder, award({ amount }), 0),
      ).toMatchObject({
        status: 400,
      });
  });

  it("requires a reason; Other needs its own text", () => {
    expect(
      checkCommunityAward(admin, builder, award({ reason: "" }), 0),
    ).toMatchObject({
      status: 400,
    });
    expect(
      checkCommunityAward(
        admin,
        builder,
        award({ reason: OTHER_REASON, otherText: " " }),
        0,
      ),
    ).toMatchObject({ status: 400 });
    expect(
      checkCommunityAward(
        admin,
        builder,
        award({
          reason: OTHER_REASON,
          otherText: "  Ran the   sign-in table ",
        }),
        0,
      ),
    ).toEqual({ ok: true, points: 5, reason: "Ran the sign-in table" });
  });
});

describe("communityUsed", () => {
  it("sums active community points in the month (club time)", () => {
    const rows = [
      {
        type: "community",
        points: 5,
        awarded_at: "2026-10-05T15:00:00Z",
        revoked_at: null,
      },
      {
        type: "community",
        points: 10,
        awarded_at: "2026-10-20T15:00:00Z",
        revoked_at: null,
      },
      // undone: doesn't count
      {
        type: "community",
        points: 10,
        awarded_at: "2026-10-21T15:00:00Z",
        revoked_at: "2026-10-21T16:00:00Z",
      },
      // 11pm Oct 31 Eastern is November in UTC, still October here
      {
        type: "community",
        points: 5,
        awarded_at: "2026-11-01T03:00:00Z",
        revoked_at: null,
      },
      {
        type: "demo",
        points: 30,
        awarded_at: "2026-10-08T15:00:00Z",
        revoked_at: null,
      },
      {
        type: "community",
        points: 5,
        awarded_at: "2026-09-30T15:00:00Z",
        revoked_at: null,
      },
    ];
    expect(communityUsed(rows, "2026-10")).toBe(20);
  });
});
