import { describe, expect, it } from "vitest";
import { clientIp, ipKey, rateLimited } from "./guest-rate-limit";

describe("rateLimited", () => {
  it("allows up to 4 failures per IP, blocks the 5th onward", () => {
    expect(rateLimited({ ip: 4, global: 4 })).toBe(false);
    expect(rateLimited({ ip: 5, global: 5 })).toBe(true);
  });
  it("blocks everyone after 30 failures in the window", () => {
    expect(rateLimited({ ip: 0, global: 29 })).toBe(false);
    expect(rateLimited({ ip: 0, global: 30 })).toBe(true);
  });
});

describe("ipKey / clientIp", () => {
  it("hashes with a salt (stable, not the raw IP)", async () => {
    const a = await ipKey("1.2.3.4", "salt");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("1.2.3.4");
    expect(await ipKey("1.2.3.4", "salt")).toBe(a);
    expect(await ipKey("1.2.3.4", "other")).not.toBe(a);
  });
  it("takes the first forwarded address", () => {
    const h = (o: Record<string, string>) => ({
      get: (n: string) => o[n] ?? null,
    });
    expect(clientIp(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe(
      "9.9.9.9",
    );
    expect(clientIp(h({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientIp(h({}))).toBe("unknown");
  });
});
