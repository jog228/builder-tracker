// Global teardown for `npm run test:db`: after every file has run (and its
// own cleanup), delete anything a test left behind. Only rows no real data
// can match: @example.invalid members and auth users, "[...]" meetings dated
// outside any season (2000s or 2099), skips on those dates, and messages from
// "*-test-*" senders (real GroupMe ids are numeric).
import { createClient } from "@supabase/supabase-js";
import { assertTestProject } from "../../lib/db-target";

const OUTSIDE_SEASON = "date.lt.2002-01-01,date.gte.2099-01-01";

export default function setup() {
  assertTestProject(process.env);
  return async function teardown() {
    assertTestProject(process.env);
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const errors: string[] = [];
    const removed: string[] = [];
    const note = (
      what: string,
      r: { data: unknown[] | null; error: { message: string } | null },
    ) => {
      if (r.error) errors.push(`${what}: ${r.error.message}`);
      else if (r.data?.length) removed.push(`${r.data.length} ${what}`);
    };

    note(
      "messages",
      await service
        .from("messages")
        .delete()
        .like("sender_groupme_id", "%-test-%")
        .select("id"),
    );
    note(
      "meetings",
      await service
        .from("events")
        .delete()
        .like("name", "[%")
        .or(OUTSIDE_SEASON)
        .select("id"),
    );
    note(
      "meeting skips",
      await service
        .from("meeting_skips")
        .delete()
        .or(OUTSIDE_SEASON)
        .select("date"),
    );
    note(
      "members",
      await service
        .from("members")
        .delete()
        .like("email", "%@example.invalid")
        .select("id"),
    );

    let authRemoved = 0;
    for (let page = 1; ; page++) {
      const { data, error } = await service.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) {
        errors.push(`auth users: ${error.message}`);
        break;
      }
      for (const u of data.users.filter((u) =>
        u.email?.endsWith("@example.invalid"),
      )) {
        const { error: dError } = await service.auth.admin.deleteUser(u.id);
        if (dError) errors.push(`auth user ${u.id}: ${dError.message}`);
        else authRemoved++;
      }
      if (data.users.length < 1000) break;
    }
    if (authRemoved) removed.push(`${authRemoved} auth users`);

    if (removed.length)
      console.warn(`[test:db sweep] removed leftovers: ${removed.join(", ")}`);
    if (errors.length)
      throw new Error(`[test:db sweep] failed:\n${errors.join("\n")}`);
  };
}
