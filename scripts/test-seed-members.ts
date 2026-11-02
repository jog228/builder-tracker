// Adds roster members (who can then sign in with Google) to the TEST
// Supabase project only. Same guard as test:db; dry run unless --write.
//
//   npm run test:seed-members -- "Ava Chen <ava@lehigh.edu>" "Ben Ruiz <ben@lehigh.edu>"
//   npm run test:seed-members -- "Ava Chen <ava@lehigh.edu>" "Ben Ruiz <ben@lehigh.edu>" --write
//
// Matches existing members by email, so running it twice changes nothing.
import { createClient } from "@supabase/supabase-js";
import { isAllowedDomain } from "../lib/auth-rules";
import { loadTestEnv } from "./test-env";

const { ref, url } = loadTestEnv();
const write = process.argv.includes("--write");
const specs = process.argv.slice(2).filter((a) => a !== "--write");

const parsed = specs.map((s) => {
  const m = /^\s*(.+?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(s);
  return m ? { name: m[1], email: m[2].toLowerCase() } : null;
});
if (!specs.length || parsed.some((p) => !p)) {
  console.error(
    'Usage: npm run test:seed-members -- "Name <email@lehigh.edu>" ... [--write]',
  );
  process.exit(1);
}
const people = parsed as { name: string; email: string }[];
for (const p of people)
  if (!isAllowedDomain(p.email))
    console.warn(
      `  ! ${p.email} isn't @lehigh.edu, so Google sign-in will be refused for it.`,
    );

const db = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // Confirm we're really talking to the test project before any write.
  const { count, error } = await db
    .from("members")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  console.log(
    `\nTarget: TEST project ${ref} (${url}), ${count ?? 0} members now.`,
  );
  console.log(write ? "Writing.\n" : "Dry run (add --write to apply).\n");

  for (const p of people) {
    const { data: existing, error: findError } = await db
      .from("members")
      .select("id, display_name, active")
      .eq("email", p.email)
      .maybeSingle();
    if (findError) throw findError;
    if (existing) {
      console.log(
        `  = ${p.email}: already "${existing.display_name}"${existing.active ? "" : " (inactive)"}, left as is`,
      );
      continue;
    }
    if (!write) {
      console.log(`  + would add "${p.name}" <${p.email}>`);
      continue;
    }
    const { data, error: insError } = await db
      .from("members")
      .insert({
        display_name: p.name,
        email: p.email,
        role: "member",
        active: true,
      })
      .select("id")
      .single();
    if (insError) throw insError;
    console.log(`  + added "${p.name}" <${p.email}> → /builders/${data.id}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
