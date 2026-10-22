// Marks exec board members as admin + excluded from rankings.
// Their messages keep syncing, but they're never scored, ranked, badged or awarded.
//
// Usage: npm run set-exec -- [--dry-run] <GroupMe name or user id> ...
//   npm run set-exec -- "Jolie Goldstein" 12345678
//
// Names match a member's display name or current GroupMe nickname
// (case-insensitive, exact). Every argument must resolve to exactly one member
// before anything is written.
import { getGroup } from "../lib/groupme";
import { createAdminClient } from "../lib/supabase/admin";

type Candidate = {
  memberId: string;
  displayName: string;
  groupmeUserId: string | null;
};

const norm = (s: string) => s.trim().toLowerCase();

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const targets = args.filter((a) => a !== "--dry-run");
  if (!targets.length) {
    console.error(
      'Usage: npm run set-exec -- [--dry-run] "<name or GroupMe id>" ...',
    );
    process.exit(1);
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("members")
    .select("id, display_name, member_identities(groupme_user_id)");
  if (error) throw error;

  const candidates: Candidate[] = data.map((m) => {
    const identity = Array.isArray(m.member_identities)
      ? m.member_identities[0]
      : m.member_identities;
    return {
      memberId: m.id,
      displayName: m.display_name,
      groupmeUserId: identity?.groupme_user_id ?? null,
    };
  });

  // Current GroupMe nicknames, in case someone renamed since we stored them.
  const nicknames = new Map<string, string>(); // groupme_user_id → nickname
  if (process.env.GROUPME_GROUP_ID) {
    const group = await getGroup(process.env.GROUPME_GROUP_ID);
    group.members?.forEach((m) => nicknames.set(m.user_id, m.nickname));
  }

  const resolved = new Map<string, Candidate>();
  const problems: string[] = [];

  for (const target of targets) {
    const matches = /^\d+$/.test(target)
      ? candidates.filter((c) => c.groupmeUserId === target)
      : candidates.filter(
          (c) =>
            norm(c.displayName) === norm(target) ||
            (c.groupmeUserId &&
              norm(nicknames.get(c.groupmeUserId) ?? "") === norm(target)),
        );

    if (matches.length === 1) {
      resolved.set(matches[0].memberId, matches[0]);
    } else if (matches.length > 1) {
      problems.push(
        `"${target}" matches ${matches.length} members; use a GroupMe id instead:\n` +
          matches
            .map((c) => `    ${c.groupmeUserId}  ${c.displayName}`)
            .join("\n"),
      );
    } else {
      const similar = candidates.filter((c) =>
        norm(c.displayName).includes(norm(target).split(/\s+/)[0]),
      );
      problems.push(
        `"${target}" matches no member.` +
          (similar.length
            ? ` Did you mean:\n` +
              similar
                .map((c) => `    ${c.groupmeUserId}  ${c.displayName}`)
                .join("\n")
            : ""),
      );
    }
  }

  if (problems.length) {
    console.error(problems.join("\n"));
    console.error("\nNothing was changed.");
    process.exit(1);
  }

  const list = [...resolved.values()];
  console.log(
    `${dryRun ? "[dry run] would mark" : "Marking"} as exec (admin + excluded):`,
  );
  list.forEach((c) =>
    console.log(`  ${c.groupmeUserId ?? "-"}  ${c.displayName}`),
  );
  if (dryRun) return;

  const { error: updateError } = await db
    .from("members")
    .update({ role: "admin", exclude_from_rankings: true })
    .in(
      "id",
      list.map((c) => c.memberId),
    );
  if (updateError) throw updateError;
  console.log(`Done. Their scores, badges and message scores were cleared.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
