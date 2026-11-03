import "server-only";
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteEmail, respondUrls } from "./email";
import { hashToken, newToken, tokenExpiry } from "./token";

/**
 * Emails the recipient of a pending teammate request a fresh confirm/decline
 * link and records whether it went out (email_status; 'failed' shows
 * "Resend" to the requester). Earlier unused links for the request stop
 * working. The caller has already checked that the viewer is the requester.
 *
 * Uses the secret-key client: it reads the recipient's email (never returned
 * to anyone) and writes teammate_tokens, which no member role can touch.
 */
export async function sendTeammateInvite(
  linkId: string,
  baseUrl: string,
): Promise<{ ok: boolean }> {
  const db = createAdminClient();
  const { data: link, error } = await db
    .from("teammate_links")
    .select(
      "id, status, project, requester:members!teammate_links_requester_id_fkey(display_name), recipient:members!teammate_links_recipient_id_fkey(display_name, email)",
    )
    .eq("id", linkId)
    .maybeSingle();
  if (error) throw error;
  const one = <T>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const requester = one(link?.requester);
  const recipient = one(link?.recipient);
  if (!link || link.status !== "pending" || !requester || !recipient?.email)
    return { ok: false };

  const token = newToken();
  const { error: delError } = await db
    .from("teammate_tokens")
    .delete()
    .eq("link_id", linkId)
    .is("used_at", null);
  if (delError) throw delError;
  const { error: insError } = await db.from("teammate_tokens").insert({
    token_hash: hashToken(token),
    link_id: linkId,
    expires_at: tokenExpiry().toISOString(),
  });
  if (insError) throw insError;

  const urls = respondUrls(baseUrl, token);
  const sent = await sendEmail({
    to: recipient.email,
    ...inviteEmail({
      requesterName: requester.display_name,
      recipientName: recipient.display_name,
      confirmUrl: urls.confirm,
      declineUrl: urls.decline,
      appUrl: baseUrl,
      project: link.project,
    }),
  });
  if (!sent.ok)
    console.error(`[teammates] invite ${linkId} not sent: ${sent.error}`);
  // Local testing without Resend: the link is in the dev server log.
  if (process.env.NODE_ENV === "development")
    console.log(`[teammates] invite ${linkId} confirm link: ${urls.confirm}`);

  const { error: upError } = await db
    .from("teammate_links")
    .update({
      email_status: sent.ok ? "sent" : "failed",
      email_sent_at: sent.ok ? new Date().toISOString() : null,
    })
    .eq("id", linkId);
  if (upError) throw upError;
  return { ok: sent.ok };
}
