// Route access, deny by default. Pure so middleware, pages and tests share it.
//
// - public: no session needed (sign-in flow, the not-a-member page, cron
//   routes, which check CRON_SECRET themselves)
// - member: any signed-in member
// - admin: everything else, including any page added later. To open a new
//   page to members, add it to MEMBER_ROUTES (and its test).
//
// Guests (portfolio spectators with a valid guest cookie, no Supabase user)
// may only view GUEST_ROUTES, a subset of the member routes; anything else
// sends them to the leaderboard. A signed-in member is never a guest.

export type Access = "public" | "member" | "admin";

const PUBLIC_ROUTES: RegExp[] = [
  /^\/login$/,
  /^\/not-a-member$/,
  /^\/auth\/(callback|confirm|denied|signout|guest-exit)$/,
  /^\/api\/cron\/[a-z-]+$/,
];

const MEMBER_ROUTES: RegExp[] = [
  /^\/$/, // redirects to /leaderboard
  /^\/leaderboard$/,
  /^\/stats$/,
  /^\/how-it-works$/, // the scoring rubric
  /^\/builders\/[0-9a-f-]{36}$/, // profiles linked from the leaderboard
  /^\/teammates\/respond$/, // confirm/decline links in teammate emails
];

/** Read-only pages guests may view (each also in MEMBER_ROUTES). */
const GUEST_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/leaderboard$/,
  /^\/how-it-works$/,
  /^\/builders\/[0-9a-f-]{36}$/,
];

/** Where non-admins land when they hit an admin route. */
export const MEMBER_HOME = "/leaderboard";

// Next serves "/stats/" as "/stats"; normalize so a slash can't sneak past.
const normalize = (pathname: string) =>
  pathname.length > 1 && pathname.endsWith("/")
    ? pathname.replace(/\/+$/, "")
    : pathname;

/** True for the read-only pages a guest may view. */
export const guestAllowed = (pathname: string) =>
  GUEST_ROUTES.some((re) => re.test(normalize(pathname)));

export function routeAccess(pathname: string): Access {
  const path = normalize(pathname);
  if (PUBLIC_ROUTES.some((re) => re.test(path))) return "public";
  if (MEMBER_ROUTES.some((re) => re.test(path))) return "member";
  return "admin";
}

export type RouteDecision =
  { action: "next" } | { action: "redirect"; to: string };

/**
 * What middleware does with a request. "isAdmin" is null when the session has
 * no linked member row; pages then send them through /auth/denied. `guest`
 * is a valid guest cookie (only consulted when not signed in).
 */
export function routeDecision(
  pathname: string,
  session: { signedIn: boolean; isAdmin: boolean | null; guest?: boolean },
): RouteDecision {
  const access = routeAccess(pathname);
  if (access === "public") return { action: "next" };
  if (!session.signedIn) {
    if (!session.guest) return { action: "redirect", to: "/login" };
    return guestAllowed(pathname)
      ? { action: "next" }
      : { action: "redirect", to: MEMBER_HOME };
  }
  if (access === "admin" && !session.isAdmin)
    return { action: "redirect", to: MEMBER_HOME };
  return { action: "next" };
}

// ─── Back to an email link after signing in ─────────────────────────────────
// A signed-out builder who opens a teammate email link is sent to /login;
// middleware remembers the link in this cookie and /auth/callback returns
// them to it. Only exact teammate links qualify, so it can't become an open
// redirect.

export const RETURN_TO_COOKIE = "bs_return_to";

const RETURN_TO =
  /^\/teammates\/respond\?token=[A-Za-z0-9_-]{43}(&action=(confirm|decline))?$/;

/** The path + query to come back to after login, or null. */
export function safeReturnTo(pathAndQuery: string | null | undefined) {
  return pathAndQuery && RETURN_TO.test(pathAndQuery) ? pathAndQuery : null;
}
