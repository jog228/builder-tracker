// Database layer for "Now Building": exec board members can't have a summary
// row (trigger), members can't write overrides (RLS), admins only as
// themselves. Throwaway fixtures, deleted afterwards.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = createClient(URL, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const tag = `summary-test-${Date.now()}`;
const authUsers: string[] = [];
const ids = { member: "", admin: "" };
let asMember: SupabaseClient;
let asAdmin: SupabaseClient;

async function fixture(role: "member" | "admin", excluded: boolean) {
  const email = `${tag}-${role}@example.invalid`;
  const { data: u, error } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error) throw error;
  authUsers.push(u.user.id);
  const { data: m, error: mError } = await service
    .from("members")
    .insert({
      display_name: `[${tag}] ${role}`,
      email,
      role,
      active: true,
      exclude_from_rankings: excluded,
      auth_user_id: u.user.id,
    })
    .select("id")
    .single();
  if (mError) throw mError;
  const { data: link, error: lError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (lError) throw lError;
  const client = createClient(
    URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { error: oError } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (oError) throw oError;
  return { id: m.id as string, client };
}

beforeAll(async () => {
  const member = await fixture("member", false);
  const admin = await fixture("admin", true); // exec: admin + excluded
  ids.member = member.id;
  ids.admin = admin.id;
  asMember = member.client;
  asAdmin = admin.client;
  const { error } = await service.from("member_summaries").insert({
    member_id: ids.member,
    project: "Test project",
    summary: "Building a test project.",
    update_count: 1,
  });
  if (error) throw error;
});

afterAll(async () => {
  const members = [ids.member, ids.admin].filter(Boolean);
  if (members.length) await service.from("members").delete().in("id", members);
  for (const id of authUsers) await service.auth.admin.deleteUser(id);
});

const read = async () =>
  (
    await service
      .from("member_summaries")
      .select("summary, override_summary, override_by, override_at")
      .eq("member_id", ids.member)
      .single()
  ).data!;

describe("member_summaries", () => {
  it("rejects a summary row for an exec board member (trigger)", async () => {
    const { error } = await service
      .from("member_summaries")
      .insert({ member_id: ids.admin, summary: "Should never exist." });
    expect(error?.code).toBe("23514");
  });

  it("members can read but not write an override (RLS)", async () => {
    const { data } = await asMember
      .from("member_summaries")
      .select("summary")
      .eq("member_id", ids.member)
      .single();
    expect(data?.summary).toBe("Building a test project.");
    const { data: updated } = await asMember
      .from("member_summaries")
      .update({ override_summary: "Self-edit", override_by: ids.member })
      .eq("member_id", ids.member)
      .select();
    expect(updated ?? []).toEqual([]);
    expect((await read()).override_summary).toBeNull();
  });

  it("members can't touch the generated summary at all", async () => {
    const { error } = await asMember
      .from("member_summaries")
      .update({ summary: "Rewritten" })
      .eq("member_id", ids.member);
    expect(error?.code).toBe("42501"); // no column privilege
  });

  it("admins override only as themselves, with the server's time", async () => {
    const other = await asAdmin
      .from("member_summaries")
      .update({ override_summary: "Edited", override_by: ids.member })
      .eq("member_id", ids.member);
    expect(other.error?.code).toBe("42501");

    const { error } = await asAdmin
      .from("member_summaries")
      .update({
        override_summary: "Edited by an admin.",
        override_by: ids.admin,
      })
      .eq("member_id", ids.member);
    expect(error).toBeNull();
    const r = await read();
    expect(r).toMatchObject({
      summary: "Building a test project.",
      override_summary: "Edited by an admin.",
      override_by: ids.admin,
    });
    expect(Date.now() - Date.parse(r.override_at!)).toBeLessThan(5 * 60_000);
  });

  it("clearing the override goes back to generated and clears who/when", async () => {
    const { error } = await asAdmin
      .from("member_summaries")
      .update({ override_summary: null, override_by: null })
      .eq("member_id", ids.member);
    expect(error).toBeNull();
    expect(await read()).toMatchObject({
      override_summary: null,
      override_by: null,
      override_at: null,
    });
  });
});
