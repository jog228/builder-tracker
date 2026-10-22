import { NextResponse } from "next/server";
import { linkMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Magic-link landing (PKCE): ?code=... from Supabase's email link.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = await createClient();
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      if (await linkMember(data.user)) {
        return NextResponse.redirect(new URL("/leaderboard", url.origin));
      }
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL("/login?error=not-member", url.origin),
      );
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
