// Database layer: RLS and triggers on attendance/events, exercised through the
// real API with real sessions. Creates a throwaway member, admin and event
// (dated 2000, so it can't land in a current score) and deletes them after.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, service } from "./fixtures";

const tag = `rls-test-${Date.now()}`;
const f = fixtures(tag);
const ids = { member: "", admin: "", event: "" };
let asMember: SupabaseClient;
let asAdmin: SupabaseClient;

beforeAll(async () => {
  // A regular, rankable member and an exec admin (admin + excluded).
  const member = await f.member("member");
  const admin = await f.member("admin", { role: "admin", excluded: true });
  ids.member = member.id;
  ids.admin = admin.id;
  asMember = member.client;
  asAdmin = admin.client;
  const { data, error } = await service
    .from("events")
    .insert({
      name: `[${tag}]`,
      date: "2000-01-06",
      type: "meeting",
      weight: 1,
    })
    .select("id")
    .single();
  if (error) throw error;
  ids.event = data.id;
});

afterAll(async () => {
  // Attendance and bonus rows go with the event and members (on delete cascade).
  if (ids.event) {
    const { error } = await service.from("events").delete().eq("id", ids.event);
    if (error) throw error;
  }
  await f.cleanup();
});

const attendanceRow = async () =>
  (
    await service
      .from("attendance")
      .select("recorded_by, recorded_at")
      .eq("event_id", ids.event)
      .eq("member_id", ids.member)
      .maybeSingle()
  ).data;

describe("a non-admin member", () => {
  it("can't mark attendance (RLS)", async () => {
    const { error } = await asMember.from("attendance").insert({
      event_id: ids.event,
      member_id: ids.member,
      recorded_by: ids.member,
    });
    expect(error?.code).toBe("42501");
    expect(await attendanceRow()).toBeNull();
  });

  it("can't create events (RLS)", async () => {
    const { error } = await asMember.from("events").insert({
      name: `[${tag}] sneaky`,
      date: "2000-01-13",
      type: "meeting",
      created_by: ids.member,
    });
    expect(error?.code).toBe("42501");
  });

  it("can't award a demo bonus (RLS)", async () => {
    const { error } = await asMember.from("bonus_points").insert({
      member_id: ids.member,
      event_id: ids.event,
      type: "demo",
      points: 30,
      reason: "self-award",
      awarded_by: ids.member,
    });
    expect(error?.code).toBe("42501");
  });
});

describe("an admin", () => {
  it("can't mark attendance in someone else's name", async () => {
    const { error } = await asAdmin.from("attendance").insert({
      event_id: ids.event,
      member_id: ids.member,
      recorded_by: ids.member,
    });
    expect(error?.code).toBe("42501");
  });

  it("marks attendance as themselves, with the server's timestamp", async () => {
    const { error } = await asAdmin.from("attendance").insert({
      event_id: ids.event,
      member_id: ids.member,
      recorded_by: ids.admin,
      recorded_at: "2001-01-01T00:00:00Z", // ignored: the trigger stamps now()
    });
    expect(error).toBeNull();
    const row = await attendanceRow();
    expect(row?.recorded_by).toBe(ids.admin);
    expect(Date.now() - Date.parse(row!.recorded_at)).toBeLessThan(5 * 60_000);
  });

  it("can't mark an exec board member present (trigger)", async () => {
    const { error } = await asAdmin.from("attendance").insert({
      event_id: ids.event,
      member_id: ids.admin,
      recorded_by: ids.admin,
    });
    expect(error?.code).toBe("23514");
  });
});

describe("once a row exists, a non-admin member", () => {
  it("can't change it", async () => {
    const { data, error } = await asMember
      .from("attendance")
      .update({ recorded_by: ids.member })
      .eq("event_id", ids.event)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS hides the row from the update
    expect((await attendanceRow())?.recorded_by).toBe(ids.admin);
  });

  it("can't delete it", async () => {
    const { data } = await asMember
      .from("attendance")
      .delete()
      .eq("event_id", ids.event)
      .select();
    expect(data).toEqual([]);
    expect(await attendanceRow()).not.toBeNull();
  });
});

describe("even the service role (backstop triggers)", () => {
  it("can't mark an exec board member present", async () => {
    const { error } = await service.from("attendance").insert({
      event_id: ids.event,
      member_id: ids.admin,
      recorded_by: ids.member,
    });
    expect(error?.code).toBe("23514");
  });

  it("can't write attendance without who marked it", async () => {
    await service.from("attendance").delete().eq("event_id", ids.event);
    const { error } = await service
      .from("attendance")
      .insert({ event_id: ids.event, member_id: ids.member });
    expect(error?.code).toBe("23502");
  });
});
