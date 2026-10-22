// Clears the debug-only `raw` payload from every stored GroupMe message.
// Usage: npm run groupme:purge-raw
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const { count, error } = await createAdminClient()
    .from("messages")
    .update({ raw: null }, { count: "exact" })
    .not("raw", "is", null);
  if (error) throw error;
  console.log(`cleared raw on ${count ?? 0} messages`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
