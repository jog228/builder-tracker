// Prints your GroupMe groups and their IDs so you can set GROUPME_GROUP_ID.
// Usage: npm run groupme:list-groups
import { listGroups } from "../lib/groupme";

async function main() {
  const groups = await listGroups();
  if (!groups.length) {
    console.log("No groups found for this token.");
    return;
  }
  console.table(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      messages: g.messages?.count ?? "",
    })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
