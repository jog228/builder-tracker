// Scores every eligible unscored message (same code as the cron route) and
// prints token usage and cost.
// Usage: npm run score-messages
import { scoreMessages } from "../lib/scoring/score-messages";
import { createAdminClient } from "../lib/supabase/admin";

scoreMessages(createAdminClient())
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
