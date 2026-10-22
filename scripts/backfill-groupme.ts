// Pulls the full GroupMe history into Supabase. Idempotent: safe to re-run.
// Usage: npm run groupme:backfill
import { createAdminClient } from "../lib/supabase/admin";
import { backfillGroupMe } from "../lib/groupme-sync";

async function main() {
  const result = await backfillGroupMe(createAdminClient(), (msg) =>
    console.log(msg),
  );
  console.log("done:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
