"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { findAllowedMember, normalizeEmail } from "@/lib/auth";
import { ALLOWED_DOMAIN } from "@/lib/auth-rules";
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

export type LoginState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return {
      status: "error",
      message: "That doesn't look like an email address.",
    };
  }

  // Backup login for the exec board only; members use Google.
  const member = await findAllowedMember(email);
  if (member?.role !== "admin") {
    return {
      status: "error",
      message:
        "Email links are only for exec board members. Use “Sign in with Google” with your Lehigh account.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${await origin()}/auth/callback`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    return {
      status: "error",
      message:
        error.status === 429
          ? "Too many login emails were sent recently. Try again in a few minutes."
          : `Couldn't send the link: ${error.message}`,
    };
  }
  return { status: "sent" };
}
