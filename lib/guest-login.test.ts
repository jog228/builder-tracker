import { describe, expect, it } from "vitest";
import { attemptGuestLogin, type GuestAttemptStore } from "./guest-login";
import { verifyGuestToken } from "./guest-token";

const env = {
  PORTFOLIO_PASSWORD: "open sesame",
  SUPABASE_SECRET_KEY: "sb_secret_test",
};
const NOW = Date.parse("2026-10-22T20:00:00Z");

/** In-memory attempts store. */
function memoryStore() {
  const rows: { key: string; ok: boolean; at: number }[] = [];
  const store: GuestAttemptStore = {
    async failures(key, since) {
      const recent = rows.filter((r) => !r.ok && r.at >= since.getTime());
      return {
        ip: recent.filter((r) => r.key === key).length,
        global: recent.length,
      };
    },
    async record(key, ok) {
      rows.push({ key, ok, at: NOW });
    },
  };
  return { store, rows };
}

describe("attemptGuestLogin", () => {
  it("mints a valid guest cookie for the right password", async () => {
    const { store, rows } = memoryStore();
    const res = await attemptGuestLogin("open sesame", "1.2.3.4", store, {
      env,
      now: NOW,
    });
    expect(res.ok).toBe(true);
    expect(await verifyGuestToken(res.ok ? res.token : "", NOW, env)).toBe(
      true,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].key).not.toContain("1.2.3.4");
  });

  it("gives a short error for a wrong password", async () => {
    const { store } = memoryStore();
    expect(
      await attemptGuestLogin("nope", "1.2.3.4", store, { env, now: NOW }),
    ).toEqual({ ok: false, error: "That password isn't right." });
  });

  it("rate-limits an IP after 5 wrong tries, even with the right password", async () => {
    const { store } = memoryStore();
    for (let i = 0; i < 5; i++)
      await attemptGuestLogin("nope", "1.2.3.4", store, { env, now: NOW });
    const res = await attemptGuestLogin("open sesame", "1.2.3.4", store, {
      env,
      now: NOW,
    });
    expect(res).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Too many tries/),
    });
    // Another IP is unaffected.
    expect(
      (
        await attemptGuestLogin("open sesame", "5.6.7.8", store, {
          env,
          now: NOW,
        })
      ).ok,
    ).toBe(true);
  });

  it("lets the IP try again after the window", async () => {
    const { store } = memoryStore();
    for (let i = 0; i < 5; i++)
      await attemptGuestLogin("nope", "1.2.3.4", store, { env, now: NOW });
    const later = NOW + 16 * 60_000;
    expect(
      (
        await attemptGuestLogin("open sesame", "1.2.3.4", store, {
          env,
          now: later,
        })
      ).ok,
    ).toBe(true);
  });

  it("is off when PORTFOLIO_PASSWORD isn't set", async () => {
    const { store, rows } = memoryStore();
    expect(
      await attemptGuestLogin("", "1.2.3.4", store, {
        env: { SUPABASE_SECRET_KEY: "x" },
        now: NOW,
      }),
    ).toMatchObject({ ok: false });
    expect(rows).toEqual([]);
  });
});
