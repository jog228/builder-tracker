import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./admin";

// Guests (portfolio spectators) have no Supabase user, so RLS gives them
// nothing. The pages they may see (leaderboard, profiles, how-it-works) read
// through this instead: the secret-key client wrapped so that only
// `.from(<allowed table>).select(...)` works. No insert/update/upsert/delete,
// no rpc, auth or storage, and no other tables. Server-only.

/** Tables the guest-visible pages read. */
export const GUEST_READABLE_TABLES = new Set([
  "score_snapshots",
  "members",
  "badges",
  "member_badges",
  "messages",
  "attendance",
  "events",
  "bonus_points",
  "member_summaries",
  "shipped_approvals",
]);

export class GuestWriteBlocked extends Error {}

export function readOnlyClient(db: SupabaseClient): SupabaseClient {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "from")
        return (table: string) => {
          if (!GUEST_READABLE_TABLES.has(table))
            throw new GuestWriteBlocked(`guests can't read ${table}`);
          const query = target.from(table);
          // Only select; every write method is absent.
          return { select: query.select.bind(query) };
        };
      if (prop === "then") return undefined; // so `await` on it works
      throw new GuestWriteBlocked(`guests can't use ${String(prop)}`);
    },
  });
}

/** The read-only client for guest page loads. */
export const guestReadClient = () => readOnlyClient(createAdminClient());
