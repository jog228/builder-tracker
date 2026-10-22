import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// requireViewer() lands here when a session no longer passes the login rules
// (not on the roster, or a non-admin magic link): sign out, then explain.
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/not-a-member", request.url));
}
