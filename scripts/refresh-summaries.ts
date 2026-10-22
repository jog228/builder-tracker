// Regenerates "Now Building" summaries for members with new scored updates
// (the same step that runs at the end of score-messages) and prints the cost.
// Usage: npm run refresh-summaries [-- --force]   (--force: every member)
import { realtimeExecutor } from "../lib/scoring/score-messages";
import { createAdminClient } from "../lib/supabase/admin";
import { refreshMemberSummaries } from "../lib/summaries/refresh";

refreshMemberSummaries(createAdminClient(), realtimeExecutor(), {
  force: process.argv.includes("--force"),
})
  .then((stats) => console.log(JSON.stringify(stats, null, 2)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
