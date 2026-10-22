// Database layer for meeting days: one meeting per date (unique index), and
// nobody can be signed in, or demo, before a meeting's date (trigger).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, service } from "./fixtures";

const f = fixtures(`meeting-test-${Date.now()}`);
const created: string[] = [];
let memberId = "";
let adminId = "";

const meeting = async (date: string) => {
  const r = await service
    .from("events")
    .insert({ name: "[test] meeting", date, type: "meeting", weight: 1 })
    .select("id")
    .single();
  if (r.data) created.push(r.data.id);
  return r;
};

beforeAll(async () => {
  memberId = (await f.member("member")).id;
  adminId = (await f.member("admin", { role: "admin" })).id;
});
afterAll(async () => {
  if (created.length) await service.from("events").delete().in("id", created);
  await f.cleanup();
});

describe("meeting days", () => {
  it("allows only one meeting per date", async () => {
    expect((await meeting("2001-01-04")).error).toBeNull();
    const dupe = await meeting("2001-01-04");
    expect(dupe.error?.code).toBe("23505");
  });

  it("refuses sign-ins before a meeting's date, even for the service role", async () => {
    const { data } = await meeting("2099-01-01");
    const { error } = await service.from("attendance").insert({
      event_id: data!.id,
      member_id: memberId,
      recorded_by: adminId,
    });
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/sign-ins open that day/);
  });

  it("refuses an early demo too (a demo signs the member in)", async () => {
    const { data } = await meeting("2099-01-08");
    const { error } = await service.from("bonus_points").insert({
      member_id: memberId,
      event_id: data!.id,
      type: "demo",
      points: 30,
      reason: "early demo",
      awarded_by: adminId,
    });
    expect(error?.code).toBe("23514");
  });

  it("allows sign-ins on or after the date", async () => {
    const { data } = await meeting("2001-01-11");
    const { error } = await service.from("attendance").insert({
      event_id: data!.id,
      member_id: memberId,
      recorded_by: adminId,
    });
    expect(error).toBeNull();
  });
});
