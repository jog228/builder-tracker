// Recomputes score snapshots (same code as the cron route).
// Usage: npm run compute-scores
import { computeAndSaveScores } from "../lib/scoring/compute-scores";
import { createAdminClient } from "../lib/supabase/admin";

computeAndSaveScores(createAdminClient())
  .then((result) => console.log(result))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
