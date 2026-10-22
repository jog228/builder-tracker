// Database layer for guests: a guest has no Supabase user, so anything they
// could reach directly is the anonymous role. It can read nothing and write
// nothing. The rate-limit log is closed to members too.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures } from "./fixtures";

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const f = fixtures(`guest-test-${Date.now()}`);
let memberId = "";
let asMember: Awaited<ReturnType<typeof f.member>>["client"];

beforeAll(async () => {
  const m = await f.member("member");
  memberId = m.id;
  asMember = m.client;
});
afterAll(() => f.cleanup());

describe("guest / anonymous role", () => {
  it.each([
    "members",
    "score_snapshots",
    "messages",
    "bonus_points",
    "member_summaries",
    "attendance",
  ])("can't read %s", async (table) => {
    const { data, error } = await anon.from(table).select("*").limit(1);
    // Either no privilege at all, or RLS returns nothing.
    expect(error ? error.code : (data ?? []).length).toSatisfy(
      (v: unknown) => v === "42501" || v === 0,
    );
  });

  it("can't award points", async () => {
    const { error } = await anon.from("bonus_points").insert({
      member_id: memberId,
      type: "community",
      points: 5,
      reason: "Instagram feature",
    });
    expect(error?.code).toBe("42501");
  });

  it("can't mark attendance or edit a summary", async () => {
    const a = await anon.from("attendance").insert({ member_id: memberId });
    expect(a.error).not.toBeNull();
    const s = await anon
      .from("member_summaries")
      .insert({ member_id: memberId, override_summary: "hi" });
    expect(s.error?.code).toBe("42501");
  });

  it("can't touch the guest rate-limit log (and neither can members)", async () => {
    for (const client of [anon, asMember]) {
      const r = await client.from("guest_login_attempts").select("*").limit(1);
      expect(r.error?.code).toBe("42501");
      const w = await client
        .from("guest_login_attempts")
        .insert({ key_hash: "x", ok: true });
      expect(w.error?.code).toBe("42501");
    }
  });
});
