// Database layer for meeting skips: only admins read, add (in their own name)
// and remove skips (RLS), and no meeting can sit on a skipped date (trigger,
// even for the service role). Dated 2099, outside any season.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, service } from "./fixtures";

const f = fixtures(`skip-test-${Date.now()}`);
const DATE = "2099-02-05";
let member: Awaited<ReturnType<typeof f.member>>;
let admin: Awaited<ReturnType<typeof f.member>>;

beforeAll(async () => {
  member = await f.member("member");
  admin = await f.member("admin", { role: "admin" });
});
afterAll(async () => {
  const skips = await service.from("meeting_skips").delete().eq("date", DATE);
  if (skips.error) throw skips.error;
  const events = await service
    .from("events")
    .delete()
    .eq("date", DATE)
    .like("name", "[%");
  if (events.error) throw events.error;
  await f.cleanup();
});

describe("meeting skips", () => {
  it("a member can't skip a week (RLS)", async () => {
    const { error } = await member.client
      .from("meeting_skips")
      .insert({ date: DATE, created_by: member.id });
    expect(error?.code).toBe("42501");
  });

  it("an admin can't skip in someone else's name (RLS)", async () => {
    const { error } = await admin.client
      .from("meeting_skips")
      .insert({ date: DATE, created_by: member.id });
    expect(error?.code).toBe("42501");
  });

  it("an admin skips as themselves; members can't see it", async () => {
    const { error } = await admin.client
      .from("meeting_skips")
      .insert({ date: DATE, reason: "test", created_by: admin.id });
    expect(error).toBeNull();
    const { data } = await member.client.from("meeting_skips").select("date");
    expect(data ?? []).toEqual([]);
  });

  it("no meeting can be created on a skipped date (trigger)", async () => {
    const { error } = await service
      .from("events")
      .insert({ name: "[test] meeting", date: DATE, type: "meeting" });
    expect(error?.code).toBe("23514");
  });

  it("a member can't undo it; an admin can", async () => {
    const { data: none } = await member.client
      .from("meeting_skips")
      .delete()
      .eq("date", DATE)
      .select();
    expect(none ?? []).toEqual([]);
    const { data } = await admin.client
      .from("meeting_skips")
      .delete()
      .eq("date", DATE)
      .select();
    expect(data).toHaveLength(1);
  });
});
