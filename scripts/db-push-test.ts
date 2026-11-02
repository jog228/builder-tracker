// `npm run db:push:test [-- --dry-run]`: applies supabase/migrations to the
// TEST project only. Reads .env.test.local (never .env.local), refuses the
// production project, and passes the test database URL explicitly, so the
// CLI's linked project (production, used by `npm run db:push`) is untouched.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { TEST_ENV_FILE, assertTestProject } from "../lib/db-target";

if (!existsSync(TEST_ENV_FILE)) {
  console.error(`${TEST_ENV_FILE} is missing (see .env.example).`);
  process.exit(1);
}
process.loadEnvFile(TEST_ENV_FILE);
let ref: string;
try {
  ref = assertTestProject(process.env, { needsDbUrl: true });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

console.log(`Pushing migrations to TEST project ${ref}…`);
const args = [
  "supabase",
  "db",
  "push",
  "--db-url",
  process.env.SUPABASE_TEST_DB_URL!,
];
if (process.argv.includes("--dry-run")) args.push("--dry-run");
const run = spawnSync("npx", args, { stdio: "inherit" });
process.exit(run.status ?? 1);
