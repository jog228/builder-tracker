"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getViewer } from "@/lib/auth";
import { sendTeammateInvite } from "@/lib/teammates/invite";
import {
  requestOutcome,
  tokenProblem,
  type RequestOutcome,
  type TokenResult,
} from "@/lib/teammates/rules";
import { hashToken, isTokenShape } from "@/lib/teammates/token";
import { createClient } from "@/lib/supabase/server";

// Teammate requests. Every action needs a signed-in member (guests and
// signed-out visitors get a 403) and goes through the RPCs in
// supabase/migrations/20261102000000_teammates.sql with the member's own
// session, which re-check who may do what.

type Fail = { ok: false; status: 400 | 403 | 404 | 409; error: string };
export type TeammateResult = { ok: true } | Fail;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGN_IN: Fail = {
  ok: false,
  status: 403,
  error: "Sign in as a builder to manage teammates.",
};
const BAD: Fail = { ok: false, status: 400, error: "Bad request." };

/** Where email links point: APP_URL if set, else this request's origin. */
async function baseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

const refresh = () => revalidatePath("/builders/[id]", "page");

const rpcFail = (error: { code?: string; message: string }): Fail =>
  error.code === "42501"
    ? SIGN_IN
    : { ok: false, status: 400, error: error.message };

/** Sends an invite, never throwing: a failure leaves the request with "Resend". */
async function invite(linkId: string) {
  try {
    return (await sendTeammateInvite(linkId, await baseUrl())).ok;
  } catch (e) {
    console.error(`[teammates] invite ${linkId} failed:`, e);
    return false;
  }
}

/**
 * Adds a teammate from the profile picker. The database checks the person is
 * on the roster, isn't you, and isn't already linked, pending, or in the
 * 30-day window after declining you. If they had already asked you, it's
 * confirmed on the spot. Otherwise it's pending and they get an email.
 */
export async function requestTeammate(
  recipientId: string,
): Promise<RequestOutcome & { emailSent?: boolean }> {
  const viewer = await getViewer();
  if (!viewer) return SIGN_IN;
  if (!UUID.test(recipientId)) return BAD;
  if (recipientId === viewer.memberId)
    return requestOutcome({ result: "self" });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_teammate", {
    p_recipient: recipientId,
  });
  if (error) return rpcFail(error);
  const outcome = requestOutcome(data);
  refresh();
  if (!outcome.ok || outcome.status === "confirmed") return outcome;
  const emailSent = await invite(outcome.linkId);
  refresh();
  return { ...outcome, emailSent };
}

/** The requester re-sends an invite whose email failed (new link; old ones stop working). */
export async function resendTeammateInvite(
  linkId: string,
): Promise<TeammateResult & { emailSent?: boolean }> {
  const viewer = await getViewer();
  if (!viewer) return SIGN_IN;
  if (!UUID.test(linkId)) return BAD;
  const supabase = await createClient();
  // RLS: pending rows are only visible to the two people involved.
  const { data: link } = await supabase
    .from("teammate_links")
    .select("requester_id, status, email_status")
    .eq("id", linkId)
    .maybeSingle();
  if (
    !link ||
    link.status !== "pending" ||
    link.requester_id !== viewer.memberId
  )
    return {
      ok: false,
      status: 404,
      error: "That request isn't open anymore.",
    };
  if (link.email_status !== "failed")
    return { ok: false, status: 409, error: "That email already went out." };
  const emailSent = await invite(linkId);
  refresh();
  return emailSent
    ? { ok: true, emailSent }
    : {
        ok: false,
        status: 400,
        error: "The email didn't send. Try again in a bit.",
      };
}

/** Accept / Decline on your own profile. Only the recipient can. */
export async function respondTeammate(
  linkId: string,
  accept: boolean,
): Promise<TeammateResult> {
  const viewer = await getViewer();
  if (!viewer) return SIGN_IN;
  if (!UUID.test(linkId) || typeof accept !== "boolean") return BAD;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_teammate", {
    p_link_id: linkId,
    p_accept: accept,
  });
  if (error) return rpcFail(error);
  if (data.result === "not_found")
    return {
      ok: false,
      status: 404,
      error: "That request isn't open anymore.",
    };
  refresh();
  return { ok: true };
}

export type TokenResponse =
  | {
      ok: true;
      result: "confirmed" | "declined";
      requesterId: string;
      requesterName: string | null;
    }
  | { ok: false; status: 400 | 403 | 404 | 409; title: string; body: string };

/**
 * Confirm / Decline from an email link. Must be signed in as the person the
 * email went to; the token is single-use and expires.
 */
export async function respondTeammateByToken(
  token: string,
  accept: boolean,
): Promise<TokenResponse> {
  const viewer = await getViewer();
  if (!viewer)
    return { ...SIGN_IN, title: "Sign in first", body: SIGN_IN.error };
  const fail = (
    result: TokenResult,
    info?: Parameters<typeof tokenProblem>[1],
  ) => ({
    ok: false as const,
    status: (result === "not_yours"
      ? 403
      : result === "invalid"
        ? 404
        : 409) as 403 | 404 | 409,
    ...tokenProblem(result, info)!,
  });
  if (!isTokenShape(token) || typeof accept !== "boolean")
    return fail("invalid");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_teammate_token", {
    p_token_hash: hashToken(token),
    p_accept: accept,
  });
  if (error)
    return {
      ok: false,
      status: 400,
      title: "Something went wrong",
      body: error.message,
    };
  if (data.result !== "confirmed" && data.result !== "declined")
    return fail(data.result, {
      status: data.status,
      requesterName: data.requester_name,
    });
  refresh();
  return {
    ok: true,
    result: data.result,
    requesterId: data.requester_id,
    requesterName: data.requester_name ?? null,
  };
}

/** Either teammate removes a confirmed link; it leaves both profiles. */
export async function removeTeammate(linkId: string): Promise<TeammateResult> {
  const viewer = await getViewer();
  if (!viewer) return SIGN_IN;
  if (!UUID.test(linkId)) return BAD;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_teammate", {
    p_link_id: linkId,
  });
  if (error) return rpcFail(error);
  if (data.result !== "removed")
    return { ok: false, status: 404, error: "You aren't teammates anymore." };
  refresh();
  return { ok: true };
}
