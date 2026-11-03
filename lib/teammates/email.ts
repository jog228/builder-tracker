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

/** Header-safe: no line breaks in a subject. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/**
 * The invite. Subject names the project when there is one. Plain-text and
 * HTML say the same thing; names and the project are escaped in the HTML
 * (the subject and text/plain are not HTML). Deliberately says nothing about
 * whether the requester learns of a decline. `appUrl` is the site's base URL
 * (where they can answer from their profile instead).
 */
export function inviteEmail({
  requesterName,
  recipientName,
  confirmUrl,
  declineUrl,
  appUrl,
  project = null,
}: {
  requesterName: string;
  recipientName: string;
  confirmUrl: string;
  declineUrl: string;
  appUrl: string;
  /** Optional project name, already cleaned (cleanProject()). */
  project?: string | null;
}) {
  const first = recipientName.trim().split(/\s+/)[0] || "builder";
  const site = appUrl.replace(/\/+$/, "");
  const subject = oneLine(
    `${requesterName} added you as a teammate on ${project || "Builder Society"}`,
  );
  const listed = `${requesterName} listed you as a teammate on Builder Society${project ? `, for ${project}` : ""}.`;
  const pitch =
    "Building together? Confirm it and you'll show up on each other's builder files. Not working together? Decline, or ignore this email and nothing happens.";
  const fine = `You'll sign in with your Lehigh Google account. Each link works once and expires in ${TOKEN_TTL_DAYS} days. You can also answer from your profile at`;
  const signoff =
    "Builder Society. Questions? Reply to this email and it goes to the club.";

  const text = [
    `Hi ${first},`,
    "",
    listed,
    "",
    pitch,
    "",
    `Confirm teammate: ${confirmUrl}`,
    `Decline: ${declineUrl}`,
    "",
    `${fine} ${site}.`,
    "",
    signoff,
  ].join("\n");

  // Buttons are plain links (inline-block, so they wrap on narrow phones).
  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:12px 18px;margin:0 8px 8px 0;border:2px solid #1B2A41;background:${primary ? "#F2B705" : "#FFFFFF"};color:#111111;font-size:16px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;text-decoration:none">${label}</a>`;
  const p = (body: string, style = "font-size:17px;line-height:1.45") =>
    `<p style="margin:0 0 16px;${style}">${body}</p>`;
  const html = `<div style="background:#E6E2D8;padding:16px;font-family:'Barlow Condensed',Arial,sans-serif;color:#1B2A41">
<div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:3px solid #1B2A41;padding:20px">
<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase">Builder Society · Teammates</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.2;text-transform:uppercase">${esc(subject)}</h1>
${p(`Hi ${esc(first)},`)}
${p(esc(listed))}
${p(esc(pitch))}
<p style="margin:0 0 8px">${button(confirmUrl, "Confirm teammate", true)}${button(declineUrl, "Decline", false)}</p>
${p(`${esc(fine)} <a href="${esc(site)}" style="color:#1B2A41">${esc(site)}</a>.`, "font-size:15px;line-height:1.45;color:#4A5568")}
${p(esc(signoff), "margin:0;font-size:15px;line-height:1.45;color:#4A5568")}
</div></div>`;
  return { subject, text, html };
}
