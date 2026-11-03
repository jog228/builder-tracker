// Database layer for teammates: requests, mutual auto-confirm, decline
// cooldown, token checks (recipient only, single use, expiry), removal, RLS
// visibility, and dropping links when someone leaves the roster. Throwaway
// fixtures, deleted afterwards.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken, newToken } from "@/lib/teammates/token";
import { fixtures, service } from "./fixtures";

const f = fixtures(`teammates-test-${Date.now()}`);
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

const request = async (as: SupabaseClient, to: string) => {
  const { data, error } = await as.rpc("request_teammate", { p_recipient: to });
  if (error) throw error;
  return data as { result: string; link_id?: string };
};

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

const issueToken = async (
  linkId: string,
  expiresAt = Date.now() + 86_400_000,
) => {
  const token = newToken();
  const { error } = await service.from("teammate_tokens").insert({
    token_hash: hashToken(token),
    link_id: linkId,
    expires_at: new Date(expiresAt).toISOString(),
  });
  if (error) throw error;
  return hashToken(token);
};

describe("requests", () => {
  it("rejects yourself and people off the roster", async () => {
    expect((await request(asA, ids.a)).result).toBe("self");
    expect((await request(asA, crypto.randomUUID())).result).toBe("not_roster");
  });

  it("creates one pending request and refuses duplicates", async () => {
    expect((await request(asA, ids.b)).result).toBe("pending");
    expect((await request(asA, ids.b)).result).toBe("already_pending");
    expect((await linkFor(ids.a, ids.b))?.status).toBe("pending");
  });

  it("only the two people involved can see a pending request (RLS)", async () => {
    const seen = async (as: SupabaseClient) =>
      (await as.from("teammate_links").select("id").eq("requester_id", ids.a))
        .data?.length;
    expect(await seen(asA)).toBe(1);
    expect(await seen(asB)).toBe(1);
    expect(await seen(asC)).toBe(0);
  });

  it("members can't write links or read tokens directly", async () => {
    const { error } = await asC.from("teammate_links").insert({
      requester_id: ids.c,
      recipient_id: ids.d,
      status: "confirmed",
    });
    expect(error).not.toBeNull();
    const { data } = await asB.from("teammate_tokens").select("token_hash");
    expect(data ?? []).toEqual([]);
  });

  it("asking someone who already asked you confirms it (one row)", async () => {
    expect((await request(asB, ids.a)).result).toBe("confirmed");
    expect((await request(asA, ids.b)).result).toBe("already_teammates");
    const { data } = await asC
      .from("teammate_links")
      .select("status")
      .eq("requester_id", ids.a);
    expect(data).toEqual([{ status: "confirmed" }]); // everyone sees confirmed
  });

  it("candidates leave out yourself and current teammates, and never include emails", async () => {
    const { data, error } = await asA.rpc("teammate_candidates");
    expect(error).toBeNull();
    const rows = data as Record<string, unknown>[];
    const got = rows.map((r) => r.id);
    expect(got).not.toContain(ids.a);
    expect(got).not.toContain(ids.b);
    expect(got).toContain(ids.c);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "avatar_url",
      "display_name",
      "id",
    ]);
  });
});

describe("email tokens", () => {
  it("only the recipient can use one, and only once", async () => {
    const { link_id } = await request(asC, ids.d);
    const hash = await issueToken(link_id!);
    const wrong = await asA.rpc("respond_teammate_token", {
      p_token_hash: hash,
      p_accept: true,
    });
    expect(wrong.data).toEqual({ result: "not_yours" });

    const ok = await asD.rpc("respond_teammate_token", {
      p_token_hash: hash,
      p_accept: false,
    });
    expect(ok.data).toMatchObject({ result: "declined" });
    const again = await asD.rpc("respond_teammate_token", {
      p_token_hash: hash,
      p_accept: true,
    });
    expect(again.data).toMatchObject({ result: "used" });
    expect((await linkFor(ids.c, ids.d))?.status).toBe("declined");
  });

  it("a declined requester waits 30 days; the decliner can ask back", async () => {
    expect((await request(asC, ids.d)).result).toBe("cooldown");
    const { data } = await asC.rpc("teammate_candidates");
    expect((data as { id: string }[]).map((r) => r.id)).not.toContain(ids.d);
    expect((await request(asD, ids.c)).result).toBe("pending");
    const link = await linkFor(ids.c, ids.d);
    expect(link).toMatchObject({ requester_id: ids.d, recipient_id: ids.c });
  });

  it("expired links don't work, but the request stays answerable", async () => {
    const link = await linkFor(ids.c, ids.d);
    const hash = await issueToken(link!.id, Date.now() - 1000);
    const r = await asC.rpc("respond_teammate_token", {
      p_token_hash: hash,
      p_accept: true,
    });
    expect(r.data).toMatchObject({ result: "expired" });
    const direct = await asC.rpc("respond_teammate", {
      p_link_id: link!.id,
      p_accept: true,
    });
    expect(direct.data).toMatchObject({ result: "confirmed" });
  });

  it("unknown tokens are invalid", async () => {
    const r = await asC.rpc("teammate_token_status", {
      p_token_hash: hashToken(newToken()),
    });
    expect(r.data).toEqual({ result: "invalid" });
  });
});

describe("removal and leaving the roster", () => {
  it("either teammate can remove; others can't", async () => {
    const link = await linkFor(ids.a, ids.b);
    const other = await asC.rpc("remove_teammate", { p_link_id: link!.id });
    expect(other.data).toEqual({ result: "not_found" });
    const mine = await asB.rpc("remove_teammate", { p_link_id: link!.id });
    expect(mine.data).toMatchObject({ result: "removed", other_id: ids.a });
    expect(await linkFor(ids.a, ids.b)).toBeNull();
  });

  it("deactivating a member drops their links", async () => {
    expect(await linkFor(ids.c, ids.d)).not.toBeNull();
    const { error } = await service
      .from("members")
      .update({ active: false })
      .eq("id", ids.d);
    expect(error).toBeNull();
    expect(await linkFor(ids.c, ids.d)).toBeNull();
    expect((await request(asC, ids.d)).result).toBe("not_roster");
  });
});
