// Throwaway members with real signed-in sessions, for tests/db. Call
// cleanup() in afterAll: it deletes the members (cascading their rows) and
// their auth users, and throws if any delete failed. Ids are recorded as
// soon as each row exists, so a fixture that fails halfway is still cleaned
// up; sweep.ts catches anything left after the whole run.
// TODO (PLAN.md §6, Phase 8): run these against a separate test project.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const service = createClient(URL, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function fixtures(tag: string) {
  const memberIds: string[] = [];
  const authIds: string[] = [];
  return {
    async member(
      key: string,
      {
        role = "member",
        excluded = false,
      }: { role?: "member" | "admin"; excluded?: boolean } = {},
    ): Promise<{ id: string; client: SupabaseClient }> {
      const email = `${tag}-${key}@example.invalid`;
      const { data: u, error } = await service.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (error) throw error;
      authIds.push(u.user.id);
      const { data: m, error: mError } = await service
        .from("members")
        .insert({
          display_name: `[${tag}] ${key}`,
          email,
          role,
          active: true,
          exclude_from_rankings: excluded,
          auth_user_id: u.user.id,
        })
        .select("id")
        .single();
      if (mError) throw mError;
      memberIds.push(m.id);
      const { data: link, error: lError } =
        await service.auth.admin.generateLink({
          type: "magiclink",
          email,
        });
      if (lError) throw lError;
      const client = createClient(
        URL,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        },
      );
      const { error: oError } = await client.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: "magiclink",
      });
      if (oError) throw oError;
      return { id: m.id, client };
    },
    async cleanup() {
      const errors: string[] = [];
      if (memberIds.length) {
        const { error } = await service
          .from("members")
          .delete()
          .in("id", memberIds);
        if (error) errors.push(`members: ${error.message}`);
      }
      for (const id of authIds) {
        const { error } = await service.auth.admin.deleteUser(id);
        if (error) errors.push(`auth user ${id}: ${error.message}`);
      }
      if (errors.length)
        throw new Error(`[${tag}] cleanup failed:\n${errors.join("\n")}`);
    },
  };
}
