// Database layer for community points: only admins award (as themselves),
// only +5/+10, no monthly cap, never to exec board members, and undo is a
// soft revoke recording who.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, service } from "./fixtures";

const f = fixtures(`community-test-${Date.now()}`);
let builder: { id: string; client: SupabaseClient };
let other: { id: string; client: SupabaseClient };
let admin: { id: string; client: SupabaseClient };
let exec: { id: string };

beforeAll(async () => {
  builder = await f.member("builder");
  other = await f.member("other");
  admin = await f.member("admin", { role: "admin" }); // a non-exec admin
  exec = await f.member("exec", { role: "admin", excluded: true });
});
afterAll(() => f.cleanup());

const award = (
  client: SupabaseClient,
  memberId: string,
  points: number,
  by: string,
) =>
  client
    .from("bonus_points")
    .insert({
      member_id: memberId,
      type: "community",
      points,
      reason: "Instagram feature",
      awarded_by: by,
    })
    .select("id")
    .maybeSingle();

describe("community points", () => {
  it("a non-admin can't award them (RLS)", async () => {
    const { error } = await award(other.client, builder.id, 5, other.id);
    expect(error?.code).toBe("42501");
  });

  it("an admin can't award in someone else's name (RLS)", async () => {
    const { error } = await award(admin.client, builder.id, 5, other.id);
    expect(error?.code).toBe("42501");
  });

  it("only +5 or +10", async () => {
    const { error } = await award(admin.client, builder.id, 7, admin.id);
    expect(error?.code).toBe("23514");
  });

  it("exec board members can't receive them (trigger)", async () => {
    const { error } = await award(admin.client, exec.id, 5, admin.id);
    expect(error?.code).toBe("23514");
  });

  let lastId = "";
  it("has no monthly cap: admins can award any number of times", async () => {
    for (const p of [10, 10, 10, 5]) {
      const { data, error } = await award(
        admin.client,
        builder.id,
        p,
        admin.id,
      );
      expect(error).toBeNull();
      lastId = data!.id;
    }
  });

  it("a non-admin can't undo one", async () => {
    const { data } = await other.client
      .from("bonus_points")
      .update({ revoked_at: new Date().toISOString(), revoked_by: other.id })
      .eq("id", lastId)
      .select();
    expect(data ?? []).toEqual([]);
  });

  it("undo is a soft revoke that records who", async () => {
    const { error } = await admin.client
      .from("bonus_points")
      .update({ revoked_at: new Date().toISOString(), revoked_by: admin.id })
      .eq("id", lastId)
      .is("revoked_at", null);
    expect(error).toBeNull();
    const { data } = await service
      .from("bonus_points")
      .select("revoked_at, revoked_by, points")
      .eq("id", lastId)
      .single();
    expect(data).toMatchObject({ revoked_by: admin.id, points: 5 });
    expect(data?.revoked_at).not.toBeNull();
  });

  it("nobody can delete one (the log stays complete)", async () => {
    const { data } = await admin.client
      .from("bonus_points")
      .delete()
      .eq("id", lastId)
      .select();
    expect(data ?? []).toEqual([]);
  });
});
