import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `npm run test:db`: integration tests against the linked Supabase project's
// real API and RLS. Not part of `npm test` (needs network and .env.local).
process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/sweep.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
