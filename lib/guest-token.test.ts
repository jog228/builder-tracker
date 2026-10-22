import { describe, expect, it } from "vitest";
import {
  GUEST_TTL_SECONDS,
  guestPasswordMatches,
  signGuestToken,
  verifyGuestToken,
} from "./guest-token";

const env = {
  PORTFOLIO_PASSWORD: "correct horse",
  SUPABASE_SECRET_KEY: "sb_secret_test",
};
const NOW = Date.parse("2026-10-22T20:00:00Z");

describe("guest token", () => {
  it("verifies a fresh token", async () => {
    const t = (await signGuestToken(NOW, env))!;
    expect(t).toMatch(/^v1\.\d+\.[A-Za-z0-9_-]+$/);
    expect(await verifyGuestToken(t, NOW, env)).toBe(true);
  });

  it("expires after about 7 days", async () => {
    const t = (await signGuestToken(NOW, env))!;
    const later = NOW + GUEST_TTL_SECONDS * 1000;
    expect(await verifyGuestToken(t, later - 60_000, env)).toBe(true);
    expect(await verifyGuestToken(t, later + 1000, env)).toBe(false);
  });

  it("rejects tampering: a pushed-out expiry or a forged signature", async () => {
    const t = (await signGuestToken(NOW, env))!;
    const [, exp, sig] = t.split(".");
    expect(
      await verifyGuestToken(`v1.${Number(exp) + 86400}.${sig}`, NOW, env),
    ).toBe(false);
    expect(
      await verifyGuestToken(`v1.${exp}.${"A".repeat(43)}`, NOW, env),
    ).toBe(false);
    expect(await verifyGuestToken("garbage", NOW, env)).toBe(false);
    expect(await verifyGuestToken(undefined, NOW, env)).toBe(false);
  });

  it("is invalidated by changing the password", async () => {
    const t = (await signGuestToken(NOW, env))!;
    expect(
      await verifyGuestToken(t, NOW, { ...env, PORTFOLIO_PASSWORD: "new one" }),
    ).toBe(false);
  });

  it("is disabled when no password is configured", async () => {
    expect(await signGuestToken(NOW, { SUPABASE_SECRET_KEY: "x" })).toBeNull();
    const t = (await signGuestToken(NOW, env))!;
    expect(
      await verifyGuestToken(t, NOW, { SUPABASE_SECRET_KEY: "sb_secret_test" }),
    ).toBe(false);
  });
});

describe("guestPasswordMatches", () => {
  it("accepts only the exact password", async () => {
    expect(await guestPasswordMatches("correct horse", env)).toBe(true);
    for (const wrong of [
      "",
      "correct horse ",
      "Correct horse",
      "correct",
      "x".repeat(200),
    ])
      expect(await guestPasswordMatches(wrong, env)).toBe(false);
  });
  it("never matches when unset", async () => {
    expect(await guestPasswordMatches("", {})).toBe(false);
    expect(await guestPasswordMatches("anything", {})).toBe(false);
  });
});
