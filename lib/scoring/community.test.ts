import { describe, expect, it } from "vitest";
import { checkCommunityAward, OTHER_REASON } from "./community";

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
    expect(checkCommunityAward(admin, builder, award())).toEqual({
      ok: true,
      points: 5,
      reason: "Instagram feature",
    });
    expect(
      checkCommunityAward(admin, builder, award({ amount: 10 })),
    ).toMatchObject({
      ok: true,
      points: 10,
    });
  });

  it("returns 403 for non-admins and signed-out visitors", () => {
    expect(
      checkCommunityAward({ memberId: "bo", isAdmin: false }, builder, award()),
    ).toMatchObject({ ok: false, status: 403 });
    expect(checkCommunityAward(null, builder, award())).toMatchObject({
      status: 403,
    });
  });

  it("returns 403 for an admin awarding themselves", () => {
    expect(
      checkCommunityAward(admin, { ...builder, id: "jo" }, award()),
    ).toMatchObject({ status: 403 });
  });

  it("refuses exec board (and inactive) members", () => {
    expect(
      checkCommunityAward(
        admin,
        { ...builder, exclude_from_rankings: true },
        award(),
      ),
    ).toMatchObject({ ok: false, status: 409 });
    expect(
      checkCommunityAward(admin, { ...builder, active: false }, award()),
    ).toMatchObject({ status: 409 });
  });

  it("has no monthly cap", () => {
    for (let i = 0; i < 6; i++)
      expect(
        checkCommunityAward(admin, builder, award({ amount: 10 })),
      ).toMatchObject({
        ok: true,
      });
  });

  it("no longer offers “Helped another builder” as a quick pick", () => {
    expect(
      checkCommunityAward(
        admin,
        builder,
        award({ reason: "Helped another builder" }),
      ),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("only allows +5 and +10", () => {
    for (const amount of [0, 1, 7, 15, 20, -5])
      expect(
        checkCommunityAward(admin, builder, award({ amount })),
      ).toMatchObject({
        status: 400,
      });
  });

  it("requires a reason; Other needs its own text", () => {
    expect(
      checkCommunityAward(admin, builder, award({ reason: "" })),
    ).toMatchObject({
      status: 400,
    });
    expect(
      checkCommunityAward(
        admin,
        builder,
        award({ reason: OTHER_REASON, otherText: " " }),
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
      ),
    ).toEqual({ ok: true, points: 5, reason: "Ran the sign-in table" });
  });
});
