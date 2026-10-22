// Database layer for "Now Building": only a profile's owner writes their
// override, in their own name (RLS); exec board members can't have a row
// (trigger); generated columns are service-role only. Throwaway fixtures,
// deleted afterwards.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = createClient(URL, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const tag = `summary-test-${Date.now()}`;
const authUsers: string[] = [];
const ids = { member: "", other: "", admin: "" };
let asMember: SupabaseClient; // the profile's owner
let asOther: SupabaseClient; // another regular member
let asAdmin: SupabaseClient; // an exec board admin

async function fixture(
  role: "member" | "admin",
  excluded: boolean,
  key: string = role,
) {
  const email = `${tag}-${key}@example.invalid`;
  const { data: u, error } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error) throw error;
  authUsers.push(u.user.id);
  const { data: m, error: mError } = await service
    .from("members")
    .insert({
      display_name: `[${tag}] ${key}`,
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
  const other = await fixture("member", false, "other");
  const admin = await fixture("admin", true); // exec: admin + excluded
  ids.member = member.id;
  ids.other = other.id;
  ids.admin = admin.id;
  asMember = member.client;
  asOther = other.client;
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
  const members = [ids.member, ids.other, ids.admin].filter(Boolean);
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

  it("another member can read but not edit it (RLS)", async () => {
    const { data } = await asOther
      .from("member_summaries")
      .select("summary")
      .eq("member_id", ids.member)
      .single();
    expect(data?.summary).toBe("Building a test project.");
    const { data: updated } = await asOther
      .from("member_summaries")
      .update({ override_summary: "Not mine", override_by: ids.other })
      .eq("member_id", ids.member)
      .select();
    expect(updated ?? []).toEqual([]);
    expect((await read()).override_summary).toBeNull();
  });

  it("an admin can't edit someone else's either (RLS)", async () => {
    const { data: updated } = await asAdmin
      .from("member_summaries")
      .update({ override_summary: "Admin edit", override_by: ids.admin })
      .eq("member_id", ids.member)
      .select();
    expect(updated ?? []).toEqual([]);
    expect((await read()).override_summary).toBeNull();
  });

  it("nobody can create a row for someone else", async () => {
    const { error } = await asOther.from("member_summaries").insert({
      member_id: ids.member,
      override_summary: "Hi",
      override_by: ids.other,
    });
    expect(error?.code).toBe("42501");
  });

  it("members can't touch the generated summary, even their own", async () => {
    const { error } = await asMember
      .from("member_summaries")
      .update({ summary: "Rewritten" })
      .eq("member_id", ids.member);
    expect(error?.code).toBe("42501"); // no column privilege
  });

  it("the owner edits their own, only in their own name, with server time", async () => {
    const spoofed = await asMember
      .from("member_summaries")
      .update({ override_summary: "Edited", override_by: ids.other })
      .eq("member_id", ids.member);
    expect(spoofed.error?.code).toBe("42501");

    const { error } = await asMember
      .from("member_summaries")
      .update({ override_summary: "My own words.", override_by: ids.member })
      .eq("member_id", ids.member);
    expect(error).toBeNull();
    const r = await read();
    expect(r).toMatchObject({
      summary: "Building a test project.",
      override_summary: "My own words.",
      override_by: ids.member,
    });
    expect(Date.now() - Date.parse(r.override_at!)).toBeLessThan(5 * 60_000);
  });

  it("the owner can reset to the auto-summary, clearing who/when", async () => {
    const { error } = await asMember
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

  it("an owner with no row yet can create one with just their text", async () => {
    const { error } = await asOther.from("member_summaries").insert({
      member_id: ids.other,
      override_summary: "Starting a CLI tool.",
      override_by: ids.other,
    });
    expect(error).toBeNull();
    const { data } = await service
      .from("member_summaries")
      .select("summary, override_summary, override_by, override_at")
      .eq("member_id", ids.other)
      .single();
    expect(data).toMatchObject({
      summary: null,
      override_summary: "Starting a CLI tool.",
      override_by: ids.other,
    });
    expect(data?.override_at).not.toBeNull();
  });
});
