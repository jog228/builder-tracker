// Keeps `npm run test:db` and `npm run db:push:test` off the production
// Supabase project. Both read `.env.test.local` (never `.env.local`) and call
// assertTestProject() before touching anything. Pure; no server-only, so the
// vitest config and plain scripts can import it.

/** The live project (ref is public: it's in the site's Supabase URL). */
export const PRODUCTION_PROJECT_REF = "uqfsevhiupwugsnbguma";

export const TEST_ENV_FILE = ".env.test.local";

/** "https://abcd.supabase.co" → "abcd"; null if it isn't a Supabase URL. */
export function projectRef(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const m = /^([a-z0-9]{20})\.supabase\.(co|in)$/.exec(host);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Throws unless env points at a Supabase project that isn't production:
 * the API URL must parse to a project ref other than production's, the
 * secret key must be set, and if a database URL is given it must mention the
 * same test ref and never production's.
 */
export function assertTestProject(
  env: Record<string, string | undefined>,
  { needsDbUrl = false } = {},
): string {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = projectRef(url);
  const fail = (why: string): never => {
    throw new Error(
      `Refusing to run against this database: ${why}\n` +
        `Put the TEST project's keys in ${TEST_ENV_FILE} (see .env.example).`,
    );
  };
  if (!ref)
    fail(
      `NEXT_PUBLIC_SUPABASE_URL (${url ?? "unset"}) isn't a Supabase project URL.`,
    );
  if (ref === PRODUCTION_PROJECT_REF)
    fail("NEXT_PUBLIC_SUPABASE_URL is the production project.");
  if (!env.SUPABASE_SECRET_KEY) fail("SUPABASE_SECRET_KEY is unset.");
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    fail("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is unset.");
  const db = env.SUPABASE_TEST_DB_URL;
  if (needsDbUrl && !db) fail("SUPABASE_TEST_DB_URL is unset.");
  if (db?.includes(PRODUCTION_PROJECT_REF))
    fail("SUPABASE_TEST_DB_URL is the production database.");
  if (db && !db.includes(ref!))
    fail(
      "SUPABASE_TEST_DB_URL is for a different project than NEXT_PUBLIC_SUPABASE_URL.",
    );
  return ref!;
}
