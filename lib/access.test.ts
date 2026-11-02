import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MEMBER_HOME,
  guestAllowed,
  routeAccess,
  routeDecision,
  safeReturnTo,
} from "./access";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("routeAccess allowlist", () => {
  it("lets members reach only the leaderboard, stats, how-it-works and profiles", () => {
    for (const p of [
      "/",
      "/leaderboard",
      "/stats",
      "/how-it-works",
      `/builders/${ID}`,
      "/stats/",
      "/teammates/respond",
    ])
      expect(routeAccess(p), p).toBe("member");
  });

  it("keeps teammate email links away from guests", () => {
    expect(guestAllowed("/teammates/respond")).toBe(false);
  });

  it("keeps the sign-in flow and cron routes public", () => {
    for (const p of [
      "/login",
      "/not-a-member",
      "/auth/callback",
      "/auth/confirm",
      "/auth/denied",
      "/auth/signout",
      "/api/cron/sync-groupme",
    ])
      expect(routeAccess(p), p).toBe("public");
  });

  it("treats every admin page as admin", () => {
    for (const p of [
      "/admin",
      "/admin/checkin",
      "/admin/shipped",
      "/admin/anything/else",
    ])
      expect(routeAccess(p), p).toBe("admin");
  });

  it("denies by default: unknown and future pages are admin-only", () => {
    for (const p of [
      "/members",
      "/admin-tools",
      "/leaderboard/export",
      "/leaderboardx",
      "/stats/raw",
      "/how-it-works/admin",
      "/builders",
      "/builders/not-a-uuid",
      `/builders/${ID}/edit`,
      "/login/../admin",
      "/loginx",
      "/auth/other",
      "/api/anything",
      "/api/cron",
      "/Leaderboard",
    ])
      expect(routeAccess(p), p).toBe("admin");
  });
});

describe("guests (portfolio spectators)", () => {
  const guest = { signedIn: false, isAdmin: null, guest: true };

  it("can view the leaderboard, profiles and how-it-works", () => {
    for (const p of ["/", "/leaderboard", "/how-it-works", `/builders/${ID}`])
      expect(routeDecision(p, guest), p).toEqual({ action: "next" });
  });

  it("are sent to the leaderboard from every other page, admin or member", () => {
    for (const p of [
      "/stats",
      "/admin/checkin",
      "/admin/shipped",
      "/admin/anything",
      "/some-future-page",
      `/builders/${ID}/edit`,
    ])
      expect(routeDecision(p, guest), p).toEqual({
        action: "redirect",
        to: MEMBER_HOME,
      });
  });

  it("still reach the public pages (login, exit)", () => {
    for (const p of ["/login", "/auth/guest-exit"])
      expect(routeDecision(p, guest)).toEqual({ action: "next" });
  });

  it("never outrank a signed-in member: the member rules apply", () => {
    expect(
      routeDecision("/stats", { signedIn: true, isAdmin: false, guest: true }),
    ).toEqual({ action: "next" });
    expect(
      routeDecision("/admin/checkin", {
        signedIn: true,
        isAdmin: false,
        guest: true,
      }),
    ).toEqual({ action: "redirect", to: MEMBER_HOME });
  });

  it("without a valid cookie are just logged out", () => {
    expect(
      routeDecision("/leaderboard", {
        signedIn: false,
        isAdmin: null,
        guest: false,
      }),
    ).toEqual({ action: "redirect", to: "/login" });
  });
});

describe("routeDecision (middleware)", () => {
  const member = { signedIn: true, isAdmin: false };
  const admin = { signedIn: true, isAdmin: true };
  const out = { signedIn: false, isAdmin: null };

  it("sends non-admins on admin routes to the leaderboard", () => {
    for (const p of ["/admin/checkin", "/admin/shipped", "/some-future-page"])
      expect(routeDecision(p, member)).toEqual({
        action: "redirect",
        to: MEMBER_HOME,
      });
  });
  it("treats a session with no member row like a non-admin", () => {
    expect(
      routeDecision("/admin/checkin", { signedIn: true, isAdmin: null }),
    ).toEqual({
      action: "redirect",
      to: MEMBER_HOME,
    });
  });
  it("lets members through to member routes and admins everywhere", () => {
    expect(routeDecision("/stats", member)).toEqual({ action: "next" });
    expect(routeDecision("/admin/checkin", admin)).toEqual({ action: "next" });
  });
  it("sends logged-out visitors to /login, except on public routes", () => {
    expect(routeDecision("/leaderboard", out)).toEqual({
      action: "redirect",
      to: "/login",
    });
    expect(routeDecision("/admin/checkin", out)).toEqual({
      action: "redirect",
      to: "/login",
    });
    expect(routeDecision("/login", out)).toEqual({ action: "next" });
  });
});

// ─── Every page and route in app/ is covered ────────────────────────────────

const APP = join(process.cwd(), "app");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/** app/(app)/builders/[id]/page.tsx → /builders/<uuid> (a real-looking URL). */
function urlFor(file: string) {
  const segments = relative(APP, file)
    .split(sep)
    .slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s))
    .map((s) => (/^\[.*\]$/.test(s) ? ID : s));
  return `/${segments.join("/")}`;
}

describe("app/ inventory", () => {
  const all = files(APP);
  const pages = all.filter((f) => f.endsWith(`${sep}page.tsx`));
  const routes = all.filter((f) => f.endsWith(`${sep}route.ts`));

  it("finds the app's pages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(7);
  });

  it.each(pages.map((f) => [urlFor(f), f]))(
    "%s guards itself to match its access level",
    (url, file) => {
      const src = readFileSync(file, "utf8");
      const access = routeAccess(url);
      if (access === "admin") expect(src, file).toMatch(/\brequireAdmin\(\)/);
      if (access === "member" && guestAllowed(url))
        // Guest-visible pages read as a member or a read-only guest.
        expect(src, file).toMatch(
          /\brequireReader\(\)|redirect\("\/leaderboard"\)/,
        );
      if (access === "member" && !guestAllowed(url)) {
        expect(src, file).toMatch(/\brequire(Viewer|Admin)\(\)/);
        expect(src, file).not.toMatch(/\brequireReader\(\)/);
      }
    },
  );

  it.each(routes.map((f) => [urlFor(f), f]))(
    "route handler %s is public and guards itself",
    (url, file) => {
      expect(routeAccess(url), file).toBe("public");
      if (url.startsWith("/api/cron/"))
        expect(readFileSync(file, "utf8"), file).toMatch(
          /\bisAuthorizedCron\(request\)/,
        );
    },
  );
});

describe("safeReturnTo (back to a teammate email link after login)", () => {
  const token = "A".repeat(43);
  it("accepts exact teammate links", () => {
    for (const p of [
      `/teammates/respond?token=${token}`,
      `/teammates/respond?token=${token}&action=confirm`,
      `/teammates/respond?token=${token}&action=decline`,
    ])
      expect(safeReturnTo(p)).toBe(p);
  });

  it("rejects anything that could redirect elsewhere", () => {
    for (const p of [
      null,
      "",
      "/leaderboard",
      "//evil.example",
      "https://evil.example/teammates/respond?token=" + token,
      `/teammates/respond?token=${token}&next=//evil.example`,
      `/teammates/respond?token=${token.slice(1)}`,
    ])
      expect(safeReturnTo(p)).toBeNull();
  });
});
