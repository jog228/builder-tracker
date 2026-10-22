import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { completeLogin, denialPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Token-hash landing: ?token_hash=...&type=magiclink (used by `npm run login-link`
// and works with a token-hash email template). Admins only outside local dev.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "magiclink") as EmailOtpType;
  const supabase = await createClient();
  if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) console.error("[auth/confirm] verifyOtp failed:", error.message);
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
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
