// Teammates part 2 (migration 20261103000000): the requester cancelling a
// pending request (with or without an email sent, no cooldown, old email
// links say "cancelled") and the optional project name on a link (cleaned,
// 60-character limit in the function and the table, shown to both people).
// Throwaway fixtures, deleted afterwards.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken, newToken } from "@/lib/teammates/token";
import { fixtures, service } from "./fixtures";

const f = fixtures(`teammates-cancel-test-${Date.now()}`);
const ids = { a: "", b: "", c: "", d: "" };
let asA: SupabaseClient;
let asB: SupabaseClient;
let asC: SupabaseClient;
let asD: SupabaseClient;

beforeAll(async () => {
  const [a, b, c, d] = await Promise.all(
    ["a", "b", "c", "d"].map((k) => f.member(k)),
  );
  Object.assign(ids, { a: a.id, b: b.id, c: c.id, d: d.id });
  [asA, asB, asC, asD] = [a.client, b.client, c.client, d.client];
});

afterAll(() => f.cleanup());

type Res = { result: string; link_id?: string; [k: string]: unknown };

const rpc = async (as: SupabaseClient, fn: string, args: object) => {
  const { data, error } = await as.rpc(fn, args);
  if (error) throw error;
  return data as Res;
};
const request = (as: SupabaseClient, to: string, project?: string) =>
  rpc(as, "request_teammate", {
    p_recipient: to,
    ...(project === undefined ? {} : { p_project: project }),
  });
const cancel = (as: SupabaseClient, linkId: string) =>
  rpc(as, "cancel_teammate_request", { p_link_id: linkId });

const linkFor = async (x: string, y: string) =>
  (
    await service
      .from("teammate_links")
      .select("*")
      .or(
        `and(requester_id.eq.${x},recipient_id.eq.${y}),and(requester_id.eq.${y},recipient_id.eq.${x})`,
      )
      .maybeSingle()
  ).data;

/** What the email would carry: a token whose hash is stored. */
const issueToken = async (linkId: string) => {
  const token = newToken();
  const { error } = await service.from("teammate_tokens").insert({
    token_hash: hashToken(token),
    link_id: linkId,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  if (error) throw error;
  return hashToken(token);
};

const visible = async (as: SupabaseClient, linkId: string) =>
  (await as.from("teammate_links").select("id").eq("id", linkId)).data
    ?.length ?? 0;

describe("cancelling a pending request", () => {
  it("only the requester can cancel; the recipient and others can't", async () => {
    const { link_id } = await request(asA, ids.b);
    expect(await cancel(asB, link_id!)).toEqual({ result: "not_found" });
    expect(await cancel(asC, link_id!)).toEqual({ result: "not_found" });
    expect((await linkFor(ids.a, ids.b))?.status).toBe("pending");
  });

  it("deletes the link and its tokens; the recipient's request disappears", async () => {
    const link = await linkFor(ids.a, ids.b);
    const hash = await issueToken(link!.id);
    expect(await visible(asB, link!.id)).toBe(1);

    expect(await cancel(asA, link!.id)).toEqual({
      result: "cancelled",
      other_id: ids.b,
    });
    expect(await linkFor(ids.a, ids.b)).toBeNull();
    expect(await visible(asB, link!.id)).toBe(0);
    const { data: tokens } = await service
      .from("teammate_tokens")
      .select("token_hash")
      .eq("token_hash", hash);
    expect(tokens).toEqual([]);

    // Profile buttons on a stale page: nothing to answer.
    expect(
      await rpc(asB, "respond_teammate", {
        p_link_id: link!.id,
        p_accept: true,
      }),
    ).toEqual({ result: "not_found" });
    // A second cancel finds nothing.
    expect(await cancel(asA, link!.id)).toEqual({ result: "not_found" });
  });

  it("the old email link says cancelled to the recipient, and can't be used", async () => {
    const { link_id } = await request(asC, ids.d);
    const hash = await issueToken(link_id!);
    await cancel(asC, link_id!);

    expect(
      await rpc(asD, "teammate_token_status", { p_token_hash: hash }),
    ).toEqual({ result: "cancelled" });
    expect(
      await rpc(asD, "respond_teammate_token", {
        p_token_hash: hash,
        p_accept: true,
      }),
    ).toEqual({ result: "cancelled" });
    expect(await linkFor(ids.c, ids.d)).toBeNull();
    // Anyone else holding the link learns nothing about it.
    expect(
      await rpc(asA, "teammate_token_status", { p_token_hash: hash }),
    ).toEqual({ result: "not_yours" });
    // Members can't read the cancelled-token table.
    const { data } = await asD
      .from("teammate_cancelled_tokens")
      .select("token_hash");
    expect(data ?? []).toEqual([]);
  });

  it("is not a decline: no cooldown, either person can ask again at once", async () => {
    // After the cancels above, both pairs are free again.
    const { data } = await asA.rpc("teammate_candidates");
    expect((data as { id: string }[]).map((r) => r.id)).toContain(ids.b);
    const again = await request(asA, ids.b);
    expect(again.result).toBe("pending");
    expect(await cancel(asA, again.link_id!)).toMatchObject({
      result: "cancelled",
    });
    expect((await request(asD, ids.c)).result).toBe("pending");
    expect((await request(asC, ids.d)).result).toBe("confirmed"); // mutual
  });

  it("works whether or not the email went out", async () => {
    // No token at all (the email was never attempted).
    const fresh = await request(asA, ids.c);
    expect(await cancel(asA, fresh.link_id!)).toMatchObject({
      result: "cancelled",
    });
    // Email failed ("Resend" showing).
    const failed = await request(asA, ids.c);
    await service
      .from("teammate_links")
      .update({ email_status: "failed" })
      .eq("id", failed.link_id!);
    expect(await cancel(asA, failed.link_id!)).toMatchObject({
      result: "cancelled",
    });
    expect(await linkFor(ids.a, ids.c)).toBeNull();
  });

  it("can't cancel once they've answered", async () => {
    const confirmed = await linkFor(ids.c, ids.d); // confirmed above
    expect(await cancel(asD, confirmed!.id)).toEqual({
      result: "already_teammates",
    });
    expect((await linkFor(ids.c, ids.d))?.status).toBe("confirmed");

    const { link_id } = await request(asB, ids.d);
    await rpc(asD, "respond_teammate", { p_link_id: link_id, p_accept: false });
    // A declined requester is never told so; and the cooldown stays.
    expect(await cancel(asB, link_id!)).toEqual({ result: "not_found" });
    expect((await request(asB, ids.d)).result).toBe("cooldown");
  });
});

describe("project name", () => {
  it("is cleaned: trimmed, control characters stripped, blank → none", async () => {
    const r = await request(asA, ids.d, "  Route\nPlanner\u0007‮ ");
    expect((await linkFor(ids.a, ids.d))?.project).toBe("Route Planner");
    await cancel(asA, r.link_id!);

    const blank = await request(asA, ids.d, "   ");
    expect((await linkFor(ids.a, ids.d))?.project).toBeNull();
    await cancel(asA, blank.link_id!);
  });

  it("allows 60 characters and rejects 61 (function and table)", async () => {
    expect(await request(asA, ids.d, "x".repeat(61))).toEqual({
      result: "project_too_long",
    });
    expect(await linkFor(ids.a, ids.d)).toBeNull();
    // Characters, not bytes: 60 emoji fit.
    const ok = await request(asA, ids.d, "🚀".repeat(60));
    expect(ok.result).toBe("pending");
    expect((await linkFor(ids.a, ids.d))?.project).toBe("🚀".repeat(60));

    // The table rejects bad values even from the secret-key client.
    for (const project of ["x".repeat(61), "   ", "bad\u0001name"]) {
      const { error } = await service
        .from("teammate_links")
        .update({ project })
        .eq("id", ok.link_id!);
      expect(error?.message).toMatch(/teammate_links_project_check/);
    }
    await cancel(asA, ok.link_id!);
  });

  it("shows for both people once confirmed, and in the email link's status", async () => {
    const { link_id } = await request(asA, ids.d, "Route Planner");
    const hash = await issueToken(link_id!);
    expect(
      await rpc(asD, "teammate_token_status", { p_token_hash: hash }),
    ).toMatchObject({ result: "ok", project: "Route Planner" });
    // The recipient sees it on their incoming request.
    const incoming = await asD
      .from("teammate_links")
      .select("project")
      .eq("id", link_id!);
    expect(incoming.data).toEqual([{ project: "Route Planner" }]);

    await rpc(asD, "respond_teammate_token", {
      p_token_hash: hash,
      p_accept: true,
    });
    for (const as of [asA, asD, asB]) {
      const { data } = await as
        .from("teammate_links")
        .select("status, project")
        .eq("id", link_id!);
      expect(data).toEqual([{ status: "confirmed", project: "Route Planner" }]);
    }
  });

  it("when it's mutual, the first request's project stays; a blank one is filled", async () => {
    const first = await request(asB, ids.c, "Robot Arm");
    expect((await request(asC, ids.b, "Something Else")).result).toBe(
      "confirmed",
    );
    expect((await linkFor(ids.b, ids.c))?.project).toBe("Robot Arm");
    await rpc(asB, "remove_teammate", { p_link_id: first.link_id });

    await request(asB, ids.c);
    expect((await request(asC, ids.b, "Drone")).result).toBe("confirmed");
    expect((await linkFor(ids.b, ids.c))?.project).toBe("Drone");
  });
});
