// Database layer for "Now Building": only a profile's owner writes their
// override, in their own name (RLS); exec board members can't have a row
// (trigger); generated columns are service-role only. Throwaway fixtures,
// deleted afterwards.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, service } from "./fixtures";

const f = fixtures(`summary-test-${Date.now()}`);
const ids = { member: "", other: "", admin: "" };
let asMember: SupabaseClient; // the profile's owner
let asOther: SupabaseClient; // another regular member
let asAdmin: SupabaseClient; // an exec board admin

beforeAll(async () => {
  const member = await f.member("member");
  const other = await f.member("other");
  const admin = await f.member("admin", { role: "admin", excluded: true }); // exec
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

afterAll(() => f.cleanup());

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
