"use server";

import { headers } from "next/headers";
import { findAllowedMember, normalizeEmail } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

  // Only emails on the member list get a link (and an account).
  if (!(await findAllowedMember(email))) {
    return {
      status: "error",
      message:
        "That email isn't on the Builder Society member list. Ask an organizer to add it.",
    };
  }

  const h = await headers();
  const origin = h.get("origin") ?? `http://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
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
