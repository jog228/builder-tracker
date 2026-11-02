import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { RETURN_TO_COOKIE, safeReturnTo } from "@/lib/access";
import { completeLogin, denialPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) and magic-link landing (PKCE): ?code=... from Supabase.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = await createClient();
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) console.error("[auth/callback] exchange failed:", error.message);
    if (!error && data.session) {
      const result = await completeLogin(supabase, data.session);
      if (result.ok) {
        // Back to a teammate email link if that's what sent them to log in.
        const jar = await cookies();
        const returnTo = safeReturnTo(jar.get(RETURN_TO_COOKIE)?.value);
        jar.delete(RETURN_TO_COOKIE);
        return NextResponse.redirect(
          new URL(returnTo ?? "/leaderboard", url.origin),
        );
      }
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL(denialPath(result.reason), url.origin),
      );
    }
  }
  // Google sends ?error=access_denied when the user cancels.
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
