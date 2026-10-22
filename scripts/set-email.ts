// Sets (or clears) the login email for a member. Only emails set here can log in.
// Usage:
//   npm run set-email -- <GroupMe user id | exact display name> <email>
//   npm run set-email -- <GroupMe user id | exact display name> --clear
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const [who, emailArg] = process.argv.slice(2);
  if (!who || !emailArg) {
    console.error(
      "Usage: npm run set-email -- <GroupMe id | name> <email | --clear>",
    );
    process.exit(1);
  }
  const db = createAdminClient();

  let memberId: string | null = null;
  if (/^\d+$/.test(who)) {
    const { data } = await db
      .from("member_identities")
      .select("member_id")
      .eq("groupme_user_id", who)
      .maybeSingle();
    memberId = data?.member_id ?? null;
  } else {
    const { data } = await db
      .from("members")
      .select("id")
      .ilike("display_name", who);
    if (data && data.length > 1)
      throw new Error(
        `"${who}" matches ${data.length} members; use a GroupMe id.`,
      );
    memberId = data?.[0]?.id ?? null;
  }
  if (!memberId) throw new Error(`No member matches "${who}".`);

  const clear = emailArg === "--clear";
  const { data, error } = await db
    .from("members")
    // Clearing also unlinks the login, so that account can't get back in.
    .update(
      clear
        ? { email: null, auth_user_id: null }
        : { email: emailArg.trim().toLowerCase() },
    )
    .eq("id", memberId)
    .select("display_name, email, role, exclude_from_rankings")
    .single();
  if (error) throw error;
  console.log(
    clear
      ? `Cleared login email for ${data.display_name}.`
      : `${data.display_name} can now log in as ${data.email}` +
          (data.role === "admin" ? " (admin / exec board)" : " (member)"),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
