// `npm run dev:test`: the dev server against the TEST Supabase project.
// Uses .env.test.local only (production-only variables from .env.local are
// blanked), refuses production, and runs on the usual http://localhost:3000.
import { spawn } from "node:child_process";
import { loadTestEnv } from "./test-env";

const { ref, url } = loadTestEnv();
console.log(`\n  ▶ Dev server on the TEST Supabase project ${ref} (${url})`);
for (const key of ["RESEND_API_KEY", "EMAIL_FROM"])
  if (!process.env[key])
    console.log(
      `    ${key} unset: invites won't email; the confirm link is printed in this log.`,
    );
console.log(
  '    Next will still list "Environments: .env.local"; its values are blanked or overridden.\n',
);

const child = spawn(
  "npx",
  ["next", "dev", "--turbopack", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: process.env,
  },
);
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
