import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Secret-key (sb_secret_) Supabase client. BYPASSES row-level security.
 * Only for cron routes and scripts — never import from client code.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
