// Database layer for meeting skips: only admins read, add (in their own name)
// and remove skips (RLS), and no meeting can sit on a skipped date (trigger,
// even for the service role). skip_meeting() skips and removes a meeting in
// one go: only with confirmation if anyone is signed in, never with demos.
// Dated 2099, outside any season.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, service } from "./fixtures";

const f = fixtures(`skip-test-${Date.now()}`);
const DATE = "2099-02-05";
const SIGNED = "2099-02-12"; // a meeting with a sign-in
const DEMOED = "2099-02-19"; // a meeting with a demo
let member: Awaited<ReturnType<typeof f.member>>;
let admin: Awaited<ReturnType<typeof f.member>>;

beforeAll(async () => {
  member = await f.member("member");
  admin = await f.member("admin", { role: "admin" });
});
afterAll(async () => {
  const skips = await service
    .from("meeting_skips")
    .delete()
    .in("date", [DATE, SIGNED, DEMOED]);
  if (skips.error) throw skips.error;
  const events = await service
    .from("events")
    .delete()
    .in("date", [DATE, SIGNED, DEMOED])
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

describe("skip_meeting()", () => {
  // Attendance can't be dated in the future (trigger), so the 2099 meetings
  // start out dated 2000 and move once their rows exist.
  const meetingWith = async (date: string, demo: boolean) => {
    const { data: ev, error } = await service
      .from("events")
      .insert({ name: "[test] meeting", date: "2000-03-02", type: "meeting" })
      .select("id")
      .single();
    if (error) throw error;
    const row = demo
      ? await service.from("bonus_points").insert({
          member_id: member.id,
          event_id: ev.id,
          type: "demo",
          points: 30,
          reason: "test",
          awarded_by: admin.id,
        })
      : await service.from("attendance").insert({
          event_id: ev.id,
          member_id: member.id,
          recorded_by: admin.id,
        });
    if (row.error) throw row.error;
    const moved = await service.from("events").update({ date }).eq("id", ev.id);
    if (moved.error) throw moved.error;
    return ev.id as string;
  };
  const exists = async (id: string) =>
    !!(await service.from("events").select("id").eq("id", id).maybeSingle())
      .data;

  it("a member can't call it", async () => {
    const { error } = await member.client.rpc("skip_meeting", {
      p_date: DATE,
      p_reason: "",
      p_remove_sign_ins: true,
    });
    expect(error?.code).toBe("42501");
  });

  it("asks before removing sign-ins, then removes them with the meeting", async () => {
    const id = await meetingWith(SIGNED, false);
    const args = { p_date: SIGNED, p_reason: " moved " };
    const refused = await admin.client.rpc("skip_meeting", {
      ...args,
      p_remove_sign_ins: false,
    });
    expect(refused.error?.code).toBe("23514");
    expect(await exists(id)).toBe(true);

    const { data, error } = await admin.client.rpc("skip_meeting", {
      ...args,
      p_remove_sign_ins: true,
    });
    expect(error).toBeNull();
    expect(data).toBe(1);
    expect(await exists(id)).toBe(false);
    const { data: skip } = await service
      .from("meeting_skips")
      .select("reason, created_by")
      .eq("date", SIGNED)
      .single();
    expect(skip).toEqual({ reason: "moved", created_by: admin.id });
  });

  it("never skips a meeting with demos", async () => {
    const id = await meetingWith(DEMOED, true);
    const { error } = await admin.client.rpc("skip_meeting", {
      p_date: DEMOED,
      p_reason: "",
      p_remove_sign_ins: true,
    });
    expect(error?.code).toBe("23514");
    expect(await exists(id)).toBe(true);
    const { data } = await service
      .from("meeting_skips")
      .select("date")
      .eq("date", DEMOED);
    expect(data).toEqual([]);
  });
});
