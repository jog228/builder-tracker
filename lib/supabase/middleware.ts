import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  RETURN_TO_COOKIE,
  routeDecision,
  routeAccess,
  safeReturnTo,
} from "@/lib/access";
import { GUEST_COOKIE, verifyGuestToken } from "@/lib/guest-token";

/**
 * Refreshes the Supabase session cookie and enforces lib/access.ts: logged-out
 * visitors go to /login, and non-admins on any non-allowlisted route go to
 * /leaderboard. Pages and server actions check again (requireViewer /
 * requireAdmin / 403).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Don't run code between createServerClient and getUser (Supabase SSR guidance).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  let isAdmin: boolean | null = null;
  if (user && routeAccess(path) === "admin") {
    // RLS: only a linked, active member can read their row.
    const { data } = await supabase
      .from("members")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    isAdmin = data ? data.role === "admin" : null;
  }

  // Guests (portfolio): a signed, unexpired cookie, checked only when nobody
  // is signed in. A member's session always wins.
  const guest =
    !user && (await verifyGuestToken(request.cookies.get(GUEST_COOKIE)?.value));

  const decision = routeDecision(path, { signedIn: !!user, isAdmin, guest });
  if (decision.action === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = decision.to;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed session cookies.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    // Signed out on a teammate email link: come back to it after login.
    const returnTo =
      decision.to === "/login" && safeReturnTo(path + request.nextUrl.search);
    if (returnTo)
      redirect.cookies.set(RETURN_TO_COOKIE, returnTo, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60,
      });
    return redirect;
  }
  return response;
}
