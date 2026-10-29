// Database layer for "Change project": only admins move an update, through
// reassign_project(), which updates message_scores.project and logs the move
// in the admin's name. Only admins read the log; nobody writes it directly.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, service } from "./fixtures";

const tag = `reassign-test-${Date.now()}`;
const f = fixtures(tag);
const MESSAGE_ID = `${Date.now()}`;
let builder: { id: string; client: SupabaseClient };
let admin: { id: string; client: SupabaseClient };
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const project = async () =>
  (
    await service
      .from("message_scores")
      .select("project")
      .eq("message_id", MESSAGE_ID)
      .single()
  ).data!.project;

const move = (client: SupabaseClient, name: string) =>
  client.rpc("reassign_project", { p_message_id: MESSAGE_ID, p_project: name });

beforeAll(async () => {
  builder = await f.member("builder");
  admin = await f.member("admin", { role: "admin" });
  const { error } = await service.from("messages").insert({
    id: MESSAGE_ID,
    member_id: builder.id,
    sender_groupme_id: tag,
    sender_type: "user",
    channel_id: tag,
    channel_name: "Main",
    text: "https://example.invalid",
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
  const { error: sError } = await service.from("message_scores").insert({
    message_id: MESSAGE_ID,
    category: "shipped_candidate",
    substance: 1,
    project: "Studlin",
    model: "test",
  });
  if (sError) throw sError;
});
afterAll(async () => {
  const { error } = await service
    .from("messages")
    .delete()
    .eq("id", MESSAGE_ID);
  if (error) throw error;
  await f.cleanup();
});

describe("reassign_project", () => {
  it("a member can't move an update", async () => {
    const { error } = await move(builder.client, "Campus Crush");
    expect(error?.code).toBe("42501");
    expect(await project()).toBe("Studlin");
  });

  it("an anonymous visitor can't call it at all", async () => {
    const { error } = await move(anon, "Campus Crush");
    expect(error).not.toBeNull();
    expect(await project()).toBe("Studlin");
  });

  it("an admin moves it, logged in their own name", async () => {
    const { data, error } = await move(admin.client, "  Campus   Crush ");
    expect(error).toBeNull();
    expect(await project()).toBe("Campus Crush");
    const { data: log } = await admin.client
      .from("project_reassignments")
      .select("id, from_project, to_project, changed_by")
      .eq("message_id", MESSAGE_ID);
    expect(log).toEqual([
      {
        id: data,
        from_project: "Studlin",
        to_project: "Campus Crush",
        changed_by: admin.id,
      },
    ]);
  });

  it("moving it to the same project is a no-op and logs nothing", async () => {
    const { data, error } = await move(admin.client, "Campus Crush");
    expect(error).toBeNull();
    expect(data).toBeNull();
    const { count } = await service
      .from("project_reassignments")
      .select("*", { count: "exact", head: true })
      .eq("message_id", MESSAGE_ID);
    expect(count).toBe(1);
  });

  it("rejects a blank name", async () => {
    const { error } = await move(admin.client, "   ");
    expect(error?.code).toBe("22023");
  });

  it("members can't read the log, and nobody can write it directly", async () => {
    const { data } = await builder.client
      .from("project_reassignments")
      .select("id")
      .eq("message_id", MESSAGE_ID);
    expect(data).toEqual([]);
    const { error } = await admin.client.from("project_reassignments").insert({
      message_id: MESSAGE_ID,
      to_project: "Forged",
      changed_by: admin.id,
    });
    expect(error?.code).toBe("42501");
  });
});
