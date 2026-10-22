// Route access, deny by default. Pure so middleware, pages and tests share it.
//
// - public: no session needed (sign-in flow, the not-a-member page, cron
//   routes, which check CRON_SECRET themselves)
// - member: any signed-in member
// - admin: everything else, including any page added later. To open a new
//   page to members, add it to MEMBER_ROUTES (and its test).

export type Access = "public" | "member" | "admin";

const PUBLIC_ROUTES: RegExp[] = [
  /^\/login$/,
  /^\/not-a-member$/,
  /^\/auth\/(callback|confirm|denied|signout)$/,
  /^\/api\/cron\/[a-z-]+$/,
];

const MEMBER_ROUTES: RegExp[] = [
  /^\/$/, // redirects to /leaderboard
  /^\/leaderboard$/,
  /^\/stats$/,
  /^\/how-it-works$/, // the scoring rubric
  /^\/builders\/[0-9a-f-]{36}$/, // profiles linked from the leaderboard
];

/** Where non-admins land when they hit an admin route. */
export const MEMBER_HOME = "/leaderboard";

export function routeAccess(pathname: string): Access {
  // Next serves "/stats/" as "/stats"; normalize so a slash can't sneak past.
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.replace(/\/+$/, "")
      : pathname;
  if (PUBLIC_ROUTES.some((re) => re.test(path))) return "public";
  if (MEMBER_ROUTES.some((re) => re.test(path))) return "member";
  return "admin";
}

export type RouteDecision =
  { action: "next" } | { action: "redirect"; to: string };

/**
 * What middleware does with a request. "isAdmin" is null when the session has
 * no linked member row; pages then send them through /auth/denied.
 */
export function routeDecision(
  pathname: string,
  session: { signedIn: boolean; isAdmin: boolean | null },
): RouteDecision {
  const access = routeAccess(pathname);
  if (access === "public") return { action: "next" };
  if (!session.signedIn) return { action: "redirect", to: "/login" };
  if (access === "admin" && !session.isAdmin)
    return { action: "redirect", to: MEMBER_HOME };
  return { action: "next" };
}
