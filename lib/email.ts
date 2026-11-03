import "server-only";

// Transactional email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
// RESEND_API_KEY and EMAIL_FROM come from env; EMAIL_FROM must be on a domain
// verified in Resend, e.g. "Builder Society <teammates@mail.example.org>".
// Replies go to EMAIL_REPLY_TO (optional; defaults to the club's inbox).
// Never throws: callers record failures and offer a resend.

/** Where replies to app email go unless EMAIL_REPLY_TO says otherwise. */
export const DEFAULT_REPLY_TO = "inaiclub@lehigh.edu";

/** EMAIL_REPLY_TO if it looks like one address, else the default. */
export function replyToAddress(
  env: Record<string, string | undefined> = process.env,
): string {
  const v = env.EMAIL_REPLY_TO?.trim();
  return v && /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(v)
    ? v
    : DEFAULT_REPLY_TO;
}

export type SendResult =
  { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(msg: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from)
    return {
      ok: false,
      error: "Email isn't set up (RESEND_API_KEY / EMAIL_FROM).",
    };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        reply_to: replyToAddress(),
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok || !body.id)
      return {
        ok: false,
        error: `Resend ${res.status}: ${body.message ?? "send failed"}`,
      };
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
