// Runs the incremental GroupMe sync locally (same code as the cron route).
// Usage: npm run groupme:sync
import { createAdminClient } from "../lib/supabase/admin";
import { syncGroupMe } from "../lib/groupme-sync";

syncGroupMe(createAdminClient())
  .then((result) => console.log("done:", result))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
