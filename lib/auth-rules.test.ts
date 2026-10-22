import { describe, expect, it } from "vitest";
import {
  admission,
  hostedDomain,
  isAllowedDomain,
  loginMethod,
} from "./auth-rules";

describe("isAllowedDomain", () => {
  it("accepts lehigh.edu in any case", () => {
    expect(isAllowedDomain("abc123@lehigh.edu")).toBe(true);
    expect(isAllowedDomain(" ABC123@Lehigh.EDU ")).toBe(true);
  });
  it("rejects other, sub- and lookalike domains", () => {
    for (const e of [
      "a@gmail.com",
      "a@cse.lehigh.edu",
      "a@lehigh.edu.evil.com",
      "a@notlehigh.edu",
      "@lehigh.edu",
      "a@b@lehigh.edu",
      "",
      null,
      undefined,
    ])
      expect(isAllowedDomain(e)).toBe(false);
  });
});

describe("loginMethod", () => {
  it("maps oauth to google and otp/magiclink to email", () => {
    expect(loginMethod([{ method: "oauth", timestamp: 1 }])).toBe("google");
    expect(loginMethod([{ method: "otp", timestamp: 1 }])).toBe("email");
    expect(loginMethod(["magiclink"])).toBe("email");
  });
  it("uses the newest entry", () => {
    expect(
      loginMethod([
        { method: "oauth", timestamp: 10 },
        { method: "otp", timestamp: 20 },
      ]),
    ).toBe("email");
    expect(
      loginMethod([
        { method: "otp", timestamp: 10 },
        { method: "oauth", timestamp: 20 },
      ]),
    ).toBe("google");
  });
  it("treats missing or unknown methods as other", () => {
    expect(loginMethod(undefined)).toBe("other");
    expect(loginMethod([])).toBe("other");
    expect(loginMethod([{ method: "password", timestamp: 1 }])).toBe("other");
  });
});

describe("hostedDomain", () => {
  it("reads Google's hd custom claim", () => {
    expect(hostedDomain({ custom_claims: { hd: "Lehigh.edu" } })).toBe(
      "lehigh.edu",
    );
    expect(hostedDomain({})).toBeNull();
    expect(hostedDomain(null)).toBeNull();
  });
});

describe("admission", () => {
  const member = { isAdmin: false };
  const admin = { isAdmin: true };
  const google = { method: "google" as const, hd: "lehigh.edu" };

  it("lets roster members in with a Lehigh Google account", () => {
    expect(admission({ ...google, email: "a@lehigh.edu", member })).toEqual({
      ok: true,
    });
  });
  it("rejects Google accounts outside lehigh.edu", () => {
    expect(
      admission({ ...google, email: "a@gmail.com", member }),
    ).toMatchObject({ reason: "domain" });
  });
  it("rejects personal Google accounts using a lehigh.edu address", () => {
    expect(
      admission({ ...google, hd: null, email: "a@lehigh.edu", member }),
    ).toMatchObject({ reason: "domain" });
  });
  it("sends Lehigh accounts that aren't on the roster to not-member", () => {
    expect(
      admission({ ...google, email: "a@lehigh.edu", member: null }),
    ).toMatchObject({ reason: "not-member" });
  });
  it("keeps magic links for admins only, except in dev", () => {
    const email = { method: "email" as const, email: "a@lehigh.edu" };
    expect(admission({ ...email, member: admin })).toEqual({ ok: true });
    expect(admission({ ...email, member })).toMatchObject({
      reason: "admins-only",
    });
    expect(admission({ ...email, member, dev: true })).toEqual({ ok: true });
    expect(admission({ ...email, member: null, dev: true })).toMatchObject({
      reason: "not-member",
    });
  });
  it("lets admins use a non-Lehigh email for the backup link", () => {
    expect(
      admission({ method: "email", email: "exec@gmail.com", member: admin }),
    ).toEqual({ ok: true });
  });
  it("rejects unknown login methods", () => {
    expect(
      admission({ method: "other", email: "a@lehigh.edu", member: admin }),
    ).toMatchObject({ ok: false });
  });
});
