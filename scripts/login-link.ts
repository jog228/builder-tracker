// DEV ONLY: prints a one-time login link for a member's email without sending
// an email (handy for testing; Supabase's built-in mailer is rate-limited).
// Usage: npm run login-link -- <email> [base url, default http://localhost:3000]
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const [email, base = "http://localhost:3000"] = process.argv.slice(2);
  if (!email) {
    console.error("Usage: npm run login-link -- <email> [base url]");
    process.exit(1);
  }
  const db = createAdminClient();
  const { data: member } = await db
    .from("members")
    .select("display_name, active")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (!member?.active)
    throw new Error(
      `${email} isn't on the member list. Run npm run set-email first.`,
    );

  const { data, error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;
  const url = new URL("/auth/confirm", base);
  url.searchParams.set("token_hash", data.properties.hashed_token);
  // A first-time email gets a "signup" token; verifyOtp needs the matching type.
  url.searchParams.set("type", data.properties.verification_type);
  console.log(
    `Login link for ${member.display_name} (one-time, expires in about an hour):\n\n${url}\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
