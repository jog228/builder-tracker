"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ALLOWED_DOMAIN } from "@/lib/auth-rules";
import { attemptGuestLogin, type GuestAttemptStore } from "@/lib/guest-login";
import { clientIp } from "@/lib/guest-rate-limit";
import { GUEST_COOKIE, GUEST_TTL_SECONDS } from "@/lib/guest-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function origin() {
  const h = await headers();
  return h.get("origin") ?? `http://${h.get("host")}`;
}

/** Starts Google sign-in. /auth/callback enforces lehigh.edu and the roster. */
export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await origin()}/auth/callback`,
      // hd only pre-selects Lehigh accounts in Google's picker; the callback checks.
      queryParams: { hd: ALLOWED_DOMAIN, prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export type GuestState = { error: string | null };

/**
 * Attempts table for the guest password's rate limit. Service role: it's a
 * security log nobody else may read or write (RLS on, no policies).
 */
function attemptStore(): GuestAttemptStore {
  const db = createAdminClient();
  return {
    async failures(keyHash, since) {
      const base = () =>
        db
          .from("guest_login_attempts")
          .select("id", { count: "exact", head: true })
          .eq("ok", false)
          .gte("at", since.toISOString());
      const [ip, all] = await Promise.all([
        base().eq("key_hash", keyHash),
        base(),
      ]);
      if (ip.error) throw ip.error;
      if (all.error) throw all.error;
      return { ip: ip.count ?? 0, global: all.count ?? 0 };
    },
    async record(keyHash, ok) {
      const { error } = await db
        .from("guest_login_attempts")
        .insert({ key_hash: keyHash, ok });
      if (error) throw error;
      // Keep the table small: a day of history is plenty for a 15-min window.
      await db
        .from("guest_login_attempts")
        .delete()
        .lt("at", new Date(Date.now() - 86_400_000).toISOString());
    },
  };
}

/**
 * Guest (portfolio) entry: checks PORTFOLIO_PASSWORD on the server, rate
 * limited, then sets a signed, httpOnly guest cookie for about 7 days.
 */
export async function enterAsGuest(
  _prev: GuestState,
  formData: FormData,
): Promise<GuestState> {
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const result = await attemptGuestLogin(
    password,
    clientIp(await headers()),
    attemptStore(),
  );
  if (!result.ok) return { error: result.error };

  (await cookies()).set(GUEST_COOKIE, result.token, {
    httpOnly: true,
    // Secure in production (HTTPS). Local dev runs on plain http.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_TTL_SECONDS,
  });
  redirect("/leaderboard");
}
