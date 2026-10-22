import "server-only";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  admission,
  hostedDomain,
  loginMethod,
  type Denial,
} from "@/lib/auth-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  userId: string;
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isExcluded: boolean;
};

// `npm run login-link` signs in non-admins locally; never in a deployed build.
const DEV = process.env.NODE_ENV === "development";

/** Normalizes an email for the members.email allowlist. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** The active member allowed to log in with this email, if any. */
export async function findAllowedMember(email: string) {
  const { data, error } = await createAdminClient()
    .from("members")
    .select("id, auth_user_id, active, role")
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  if (error) throw error;
  return data?.active ? data : null;
}

/** Where a denied login lands. */
export function denialPath(reason: Denial) {
  return reason === "not-member" ? "/not-a-member" : `/login?error=${reason}`;
}

/**
 * Runs right after Supabase creates a session (Google or magic link): checks
 * the domain/method rules and links the auth user to their roster row by email.
 * The caller signs the session out when this returns a denial.
 */
export async function completeLogin(
  supabase: SupabaseClient,
  session: Session,
): Promise<{ ok: true } | { ok: false; reason: Denial }> {
  // Verify the brand-new token directly; its cookies were only just set.
  const { data: claimsData } = await supabase.auth.getClaims(
    session.access_token,
  );
  const user = session.user;
  if (!user?.email || !claimsData) return { ok: false, reason: "not-member" };

  const method = loginMethod(claimsData.claims.amr);
  const member = await findAllowedMember(user.email);
  const decision = admission({
    method,
    email: user.email,
    hd: hostedDomain(user.user_metadata),
    member: member && { isAdmin: member.role === "admin" },
    dev: DEV,
  });
  if (!decision.ok) {
    console.warn(
      `[auth] denied ${method} login (${decision.reason}) for user ${user.id}`,
    );
    return decision;
  }

  if (member!.auth_user_id === user.id) return decision;
  if (member!.auth_user_id) return { ok: false, reason: "linked-elsewhere" };
  const { error } = await createAdminClient()
    .from("members")
    .update({ auth_user_id: user.id })
    .eq("id", member!.id)
    .is("auth_user_id", null);
  if (error) throw error;
  return decision;
}

/**
 * The logged-in member, or null. Cached per request. Re-applies the login
 * rules on every request, so e.g. a magic-link session stops working if that
 * member is no longer an admin.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return null;
  // RLS: a linked, active member can read members.
  const { data } = await supabase
    .from("members")
    .select("id, display_name, avatar_url, role, exclude_from_rankings")
    .eq("auth_user_id", claims.sub)
    .maybeSingle();
  if (!data) return null;
  const decision = admission({
    method: loginMethod(claims.amr),
    email: claims.email,
    hd: hostedDomain(claims.user_metadata),
    member: { isAdmin: data.role === "admin" },
    dev: DEV,
  });
  if (!decision.ok) return null;
  return {
    userId: claims.sub,
    memberId: data.id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    isAdmin: data.role === "admin",
    isExcluded: data.exclude_from_rankings,
  };
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  // Signs out the stale session, then shows the not-a-member page.
  if (!viewer) redirect("/auth/denied");
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) redirect("/leaderboard");
  return viewer;
}
