// The teammate invite email. Pure: names and links in, subject/text/html out.
import { TOKEN_TTL_DAYS } from "./token";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** /teammates/respond links for a token. */
export function respondUrls(baseUrl: string, token: string) {
  const base = `${baseUrl.replace(/\/+$/, "")}/teammates/respond?token=${token}`;
  return {
    confirm: `${base}&action=confirm`,
    decline: `${base}&action=decline`,
  };
}

export function inviteEmail({
  requesterName,
  recipientName,
  confirmUrl,
  declineUrl,
  project = null,
}: {
  requesterName: string;
  recipientName: string;
  confirmUrl: string;
  declineUrl: string;
  /** Optional project name, already cleaned (cleanProject()). */
  project?: string | null;
}) {
  const first = recipientName.trim().split(/\s+/)[0] || "builder";
  const subject = `${requesterName} added you as a teammate`;
  const text = [
    `Hey ${first},`,
    "",
    `${requesterName} says you're building together. Confirm and you'll show up as teammates on each other's builder file.`,
    "",
    ...(project ? [`Project: ${project}`, ""] : []),
    `Confirm: ${confirmUrl}`,
    `Decline: ${declineUrl}`,
    "",
    `Sign in with your Lehigh Google account to answer. The link works once and expires in ${TOKEN_TTL_DAYS} days.`,
    "",
    "Keep building,",
    "Builder Society",
  ].join("\n");

  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:10px 18px;margin-right:8px;border:2px solid #1B2A41;background:${primary ? "#F2B705" : "#FFFFFF"};color:#111111;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;text-decoration:none">${label}</a>`;
  const html = `<div style="background:#E6E2D8;padding:24px;font-family:'Barlow Condensed',Arial,sans-serif;color:#1B2A41">
<div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:3px solid #1B2A41;padding:24px">
<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase">Builder Society · Teammates</p>
<h1 style="margin:0 0 16px;font-size:24px;text-transform:uppercase">${esc(requesterName)} added you as a teammate</h1>
<p style="margin:0 0 16px;font-size:17px;line-height:1.4">Hey ${esc(first)}, ${esc(requesterName)} says you're building together. Confirm and you'll show up as teammates on each other's builder file.</p>
${project ? `<p style="margin:0 0 16px;font-size:17px"><span style="font-weight:700;letter-spacing:0.06em;text-transform:uppercase">Project:</span> ${esc(project)}</p>\n` : ""}<p style="margin:0 0 16px">${button(confirmUrl, "Confirm", true)}${button(declineUrl, "Decline", false)}</p>
<p style="margin:0;font-size:14px;color:#4A5568">Sign in with your Lehigh Google account to answer. The link works once and expires in ${TOKEN_TTL_DAYS} days.</p>
</div></div>`;
  return { subject, text, html };
}
