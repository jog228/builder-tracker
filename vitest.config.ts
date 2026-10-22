import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["**/*.test.ts"],
    // tests/db hits the real project; run it with `npm run test:db`.
    exclude: ["node_modules", ".next", "tests/db/**"],
  },
});
