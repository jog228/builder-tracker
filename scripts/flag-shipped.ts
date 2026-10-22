// Puts a message in the shipped review queue (or bumps it), e.g. when the
// classifier missed a real launch. An exec member still makes the decision.
// Usage: npm run flag-shipped -- <GroupMe message id> [--priority N]
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const args = process.argv.slice(2);
  const p = args.indexOf("--priority");
  const priority = p >= 0 ? Number(args[p + 1]) : 100;
  const messageId = args.find(
    (a, i) => /^\d+$/.test(a) && (p < 0 || i !== p + 1),
  );
  if (!messageId || Number.isNaN(priority)) {
    console.error("Usage: npm run flag-shipped -- <message id> [--priority N]");
    process.exit(1);
  }

  const db = createAdminClient();
  const { data: existing, error } = await db
    .from("shipped_approvals")
    .select("status")
    .eq("message_id", messageId)
    .maybeSingle();
  if (error) throw error;
  if (existing && existing.status !== "pending") {
    console.log(`Already decided (${existing.status}); left unchanged.`);
    return;
  }

  const { error: upsertError } = await db.from("shipped_approvals").upsert(
    {
      message_id: messageId,
      priority,
      ...(existing ? {} : { source: "manual" }),
    },
    { onConflict: "message_id" },
  );
  if (upsertError) throw upsertError;
  console.log(
    `${existing ? "Bumped" : "Queued"} ${messageId} with priority ${priority}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
