// Imports login emails from the roster CSV, matching rows to members by
// GroupMe name (or a GroupMe id column). Dry run by default: prints every row
// that won't import cleanly. Pass --write to save the matched emails.
// Usage: npm run roster:import -- [path, default data/roster.csv] [--write]
import { readFileSync } from "node:fs";
import {
  matchRoster,
  needsLehighWarning,
  readRoster,
  type RosterMember,
  type RowResult,
} from "../lib/roster";
import { createAdminClient } from "../lib/supabase/admin";

const fmt = (r: RowResult) =>
  `  line ${r.row.line}: "${r.row.name}" <${r.row.email}>`;
const names = (ms: RosterMember[]) => ms.map((m) => `"${m.name}"`).join(", ");

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const path = args.find((a) => !a.startsWith("--")) ?? "data/roster.csv";
  const rows = readRoster(readFileSync(path, "utf8"));

  const db = createAdminClient();
  const [{ data: members, error }, { data: ids, error: idError }] =
    await Promise.all([
      db.from("members").select("id, display_name, email, active"),
      db.from("member_identities").select("member_id, groupme_user_id"),
    ]);
  if (error) throw error;
  if (idError) throw idError;
  const groupme = new Map(ids!.map((i) => [i.member_id, i.groupme_user_id]));
  const results = matchRoster(
    rows,
    members!.map((m) => ({
      id: m.id,
      name: m.display_name,
      email: m.email,
      groupmeId: groupme.get(m.id) ?? null,
      active: m.active,
    })),
  );
  const by = (s: RowResult["status"]) => results.filter((r) => r.status === s);

  console.log(`${path}: ${rows.length} rows, ${members!.length} members\n`);
  const problems: [string, RowResult[], (r: RowResult) => string][] = [
    [
      "UNMATCHED (no member with that GroupMe name)",
      by("unmatched"),
      (r) =>
        r.status === "unmatched" && r.suggestions.length
          ? `    did you mean ${names(r.suggestions)}?`
          : "",
    ],
    [
      "AMBIGUOUS (several members share that name; add a GroupMe ID column)",
      by("ambiguous"),
      (r) =>
        r.status === "ambiguous"
          ? `    candidates: ${r.candidates.length} × "${r.candidates[0].name}"`
          : "",
    ],
    [
      "CONFLICT (member already has a different email; fix with npm run set-email)",
      by("conflict"),
      (r) =>
        r.status === "conflict"
          ? `    ${r.member.name} currently <${r.member.email}>`
          : "",
    ],
    [
      "DUPLICATE",
      by("duplicate"),
      (r) => (r.status === "duplicate" ? `    ${r.reason}` : ""),
    ],
    ["INVALID EMAIL", by("invalid-email"), () => ""],
  ];
  for (const [title, list, detail] of problems) {
    if (!list.length) continue;
    console.log(`${title}: ${list.length}`);
    for (const r of list) {
      console.log(fmt(r));
      const d = detail(r);
      if (d) console.log(d);
    }
    console.log();
  }

  const warn = results.filter(needsLehighWarning);
  if (warn.length) {
    console.log(
      `NOT @lehigh.edu (can't use Google; admins can still use an email link): ${warn.length}`,
    );
    for (const r of warn) console.log(fmt(r));
    console.log();
  }
  const inactive = results.filter(
    (r) => (r.status === "set" || r.status === "unchanged") && !r.member.active,
  );
  if (inactive.length) {
    console.log(
      `INACTIVE MEMBERS (email saved, but they can't log in): ${inactive.length}`,
    );
    for (const r of inactive) console.log(fmt(r));
    console.log();
  }

  const toSet = by("set");
  console.log(
    `Ready: ${toSet.length} to set, ${by("unchanged").length} already set.`,
  );
  if (!write) {
    console.log("Dry run. Nothing written. Re-run with --write to save.");
    return;
  }
  for (const r of toSet) {
    if (r.status !== "set") continue;
    const { error } = await db
      .from("members")
      .update({ email: r.row.email })
      .eq("id", r.member.id)
      .is("email", null);
    if (error) throw new Error(`line ${r.row.line}: ${error.message}`);
  }
  console.log(`Wrote ${toSet.length} emails.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
