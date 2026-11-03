// Shared by the scripts that work against the TEST Supabase project
// (`dev:test`, `test:seed-members`): loads .env.test.local over the current
// environment, blanks every variable that exists only in .env.local
// (production), and refuses to continue unless the result points at a
// non-production project (lib/db-target.ts).
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { TEST_ENV_FILE, assertTestProject } from "../lib/db-target";

const PROD_ENV_FILE = ".env.local";

export function loadTestEnv(): { ref: string; url: string } {
  if (!existsSync(TEST_ENV_FILE)) {
    console.error(`${TEST_ENV_FILE} is missing (see .env.example).`);
    process.exit(1);
  }
  const test = parseEnv(readFileSync(TEST_ENV_FILE, "utf8"));
  // Next.js loads .env.local itself but never overrides a variable that is
  // already set, even to "". Blank everything production defines that the
  // test file doesn't, so no production secret (GroupMe, Anthropic, cron,
  // guest password, ...) reaches a test run.
  if (existsSync(PROD_ENV_FILE))
    for (const key of Object.keys(
      parseEnv(readFileSync(PROD_ENV_FILE, "utf8")),
    ))
      if (!(key in test)) process.env[key] = "";
  // Test values win over anything exported in the shell.
  Object.assign(process.env, test);

  try {
    const ref = assertTestProject(process.env);
    return { ref, url: process.env.NEXT_PUBLIC_SUPABASE_URL! };
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
