import { NextResponse } from "next/server";
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
      if (result.ok)
        return NextResponse.redirect(new URL("/leaderboard", url.origin));
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL(denialPath(result.reason), url.origin),
      );
    }
  }
  // Google sends ?error=access_denied when the user cancels.
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
