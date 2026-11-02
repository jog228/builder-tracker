import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { TEST_ENV_FILE, assertTestProject } from "./lib/db-target";

// `npm run test:db`: integration tests against the separate TEST Supabase
// project's real API and RLS. Not part of `npm test` (needs network). Reads
// .env.test.local only, and refuses to start if it points at production
// (tests/db/fixtures.ts and sweep.ts check again).
if (!existsSync(TEST_ENV_FILE))
  throw new Error(
    `${TEST_ENV_FILE} is missing. test:db only runs against the test project (see .env.example).`,
  );
process.loadEnvFile(TEST_ENV_FILE);
assertTestProject(process.env);

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/sweep.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
