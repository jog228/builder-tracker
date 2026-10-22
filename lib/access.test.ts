import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { MEMBER_HOME, routeAccess, routeDecision } from "./access";

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
    ])
      expect(routeAccess(p), p).toBe("member");
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
      if (access === "member")
        expect(src, file).toMatch(
          /\brequire(Viewer|Admin)\(\)|redirect\("\/leaderboard"\)/,
        );
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
