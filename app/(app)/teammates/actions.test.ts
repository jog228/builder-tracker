// Teammate actions: signed-out visitors and guests get a 403 without touching
// the database; inputs are checked before any RPC; a failed email leaves the
// request in place (emailSent: false) instead of failing it.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  viewer: null as { memberId: string } | null,
  rpcs: [] as { fn: string; args: unknown }[],
  rpcResult: {} as Record<string, unknown>,
  link: null as Record<string, unknown> | null,
  invite: vi.fn(async () => ({ ok: true })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://bs.example" }),
}));
vi.mock("@/lib/auth", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/teammates/invite", () => ({
  sendTeammateInvite: state.invite,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: unknown) => {
      state.rpcs.push({ fn, args });
      return { data: state.rpcResult, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.link }) }),
      }),
    }),
  }),
}));

const {
  cancelTeammateRequest,
  removeTeammate,
  requestTeammate,
  resendTeammateInvite,
  respondTeammate,
  respondTeammateByToken,
} = await import("./actions");

const ME = "22222222-2222-4222-8222-222222222222";
const THEM = "33333333-3333-4333-8333-333333333333";
const LINK = "44444444-4444-4444-8444-444444444444";
const TOKEN = "A".repeat(43);

beforeEach(() => {
  state.viewer = { memberId: ME };
  state.rpcs = [];
  state.rpcResult = {};
  state.link = null;
  state.invite.mockReset();
  state.invite.mockResolvedValue({ ok: true });
});

describe("signed out / guests", () => {
  it("get a 403 from every action and never reach the database", async () => {
    state.viewer = null;
    for (const r of await Promise.all([
      requestTeammate(THEM),
      respondTeammate(LINK, true),
      respondTeammateByToken(TOKEN, true),
      removeTeammate(LINK),
      resendTeammateInvite(LINK),
      cancelTeammateRequest(LINK),
    ]))
      expect(r).toMatchObject({ ok: false, status: 403 });
    expect(state.rpcs).toEqual([]);
  });
});

describe("requestTeammate", () => {
  it("rejects yourself and non-ids before the database", async () => {
    expect(await requestTeammate(ME)).toMatchObject({ ok: false, status: 400 });
    expect(await requestTeammate("Ava Chen")).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(state.rpcs).toEqual([]);
  });

  it("creates a pending request and emails them", async () => {
    state.rpcResult = { result: "pending", link_id: LINK };
    expect(await requestTeammate(THEM)).toEqual({
      ok: true,
      status: "pending",
      linkId: LINK,
      emailSent: true,
    });
    expect(state.rpcs).toEqual([
      { fn: "request_teammate", args: { p_recipient: THEM, p_project: null } },
    ]);
    expect(state.invite).toHaveBeenCalledWith(LINK, "https://bs.example");
  });

  it("sends the cleaned project name, and rejects a long one before the database", async () => {
    state.rpcResult = { result: "pending", link_id: LINK };
    await requestTeammate(THEM, "  Route\nPlanner\u0007 ");
    expect(state.rpcs[0].args).toEqual({
      p_recipient: THEM,
      p_project: "Route Planner",
    });
    state.rpcs = [];
    expect(await requestTeammate(THEM, "x".repeat(61))).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await requestTeammate(THEM, 7 as unknown as string)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(state.rpcs).toEqual([]);
  });

  it("keeps the request when the email fails", async () => {
    state.rpcResult = { result: "pending", link_id: LINK };
    state.invite.mockRejectedValue(new Error("network down"));
    expect(await requestTeammate(THEM)).toMatchObject({
      ok: true,
      emailSent: false,
    });
  });

  it("doesn't email when it was mutual (auto-confirmed)", async () => {
    state.rpcResult = { result: "confirmed", link_id: LINK };
    expect(await requestTeammate(THEM)).toMatchObject({
      ok: true,
      status: "confirmed",
    });
    expect(state.invite).not.toHaveBeenCalled();
  });

  it("passes on duplicates and cooldowns", async () => {
    state.rpcResult = { result: "already_pending", link_id: LINK };
    expect(await requestTeammate(THEM)).toMatchObject({
      ok: false,
      status: 409,
    });
    state.rpcResult = { result: "cooldown", until: "2026-12-02T00:00:00Z" };
    expect(await requestTeammate(THEM)).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(state.invite).not.toHaveBeenCalled();
  });
});

describe("resendTeammateInvite", () => {
  it("only resends your own pending request whose email failed", async () => {
    state.link = {
      requester_id: THEM,
      status: "pending",
      email_status: "failed",
    };
    expect(await resendTeammateInvite(LINK)).toMatchObject({
      ok: false,
      status: 404,
    });
    state.link = { requester_id: ME, status: "pending", email_status: "sent" };
    expect(await resendTeammateInvite(LINK)).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(state.invite).not.toHaveBeenCalled();
    state.link = {
      requester_id: ME,
      status: "pending",
      email_status: "failed",
    };
    expect(await resendTeammateInvite(LINK)).toEqual({
      ok: true,
      emailSent: true,
    });
  });
});

describe("respondTeammateByToken", () => {
  it("sends only the token's hash to the database", async () => {
    state.rpcResult = {
      result: "confirmed",
      requester_id: THEM,
      requester_name: "Ava",
    };
    expect(await respondTeammateByToken(TOKEN, true)).toEqual({
      ok: true,
      result: "confirmed",
      requesterId: THEM,
      requesterName: "Ava",
    });
    const args = state.rpcs[0].args as { p_token_hash: string };
    expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(state.rpcs)).not.toContain(TOKEN);
  });

  it("rejects malformed tokens without a lookup", async () => {
    expect(await respondTeammateByToken("nope", true)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(state.rpcs).toEqual([]);
  });

  it.each([
    ["cancelled", 409, "Request cancelled"],
    ["expired", 409, "This link expired"],
    ["used", 409, "Link already used"],
    ["not_yours", 403, "Wrong account"],
  ])("explains a %s link", async (result, status, title) => {
    state.rpcResult = { result, status: "pending" };
    expect(await respondTeammateByToken(TOKEN, true)).toMatchObject({
      ok: false,
      status,
      title,
    });
  });
});

describe("respondTeammate / removeTeammate", () => {
  it("404 when the database says it isn't yours or isn't open", async () => {
    state.rpcResult = { result: "not_found" };
    expect(await respondTeammate(LINK, true)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await removeTeammate(LINK)).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe("cancelTeammateRequest", () => {
  it("checks the id before the database, then calls the cancel RPC", async () => {
    expect(await cancelTeammateRequest("nope")).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(state.rpcs).toEqual([]);
    state.rpcResult = { result: "cancelled", other_id: THEM };
    expect(await cancelTeammateRequest(LINK)).toEqual({ ok: true });
    expect(state.rpcs).toEqual([
      { fn: "cancel_teammate_request", args: { p_link_id: LINK } },
    ]);
  });

  it("explains when it's already accepted or isn't yours / open", async () => {
    state.rpcResult = { result: "already_teammates" };
    expect(await cancelTeammateRequest(LINK)).toMatchObject({
      ok: false,
      status: 409,
    });
    state.rpcResult = { result: "not_found" };
    expect(await cancelTeammateRequest(LINK)).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});
