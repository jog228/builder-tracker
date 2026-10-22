import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
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

/** Normalizes an email for the members.email allowlist. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** The active member allowed to log in with this email, if any. */
export async function findAllowedMember(email: string) {
  const { data, error } = await createAdminClient()
    .from("members")
    .select("id, auth_user_id, active")
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  if (error) throw error;
  return data?.active ? data : null;
}

/**
 * Links a freshly authenticated user to their member row (by email).
 * Returns false if the email isn't on the member list or the member is
 * already linked to a different login.
 */
export async function linkMember(user: User): Promise<boolean> {
  if (!user.email) return false;
  const member = await findAllowedMember(user.email);
  if (!member) return false;
  if (member.auth_user_id === user.id) return true;
  if (member.auth_user_id) return false;
  const { error } = await createAdminClient()
    .from("members")
    .update({ auth_user_id: user.id })
    .eq("id", member.id)
    .is("auth_user_id", null);
  if (error) throw error;
  return true;
}

/** The logged-in member, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // RLS: a linked, active member can read members.
  const { data } = await supabase
    .from("members")
    .select("id, display_name, avatar_url, role, exclude_from_rankings")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    userId: user.id,
    memberId: data.id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    isAdmin: data.role === "admin",
    isExcluded: data.exclude_from_rankings,
  };
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?error=not-member");
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) redirect("/leaderboard");
  return viewer;
}
