import { describe, expect, it } from "vitest";
import { inviteEmail, respondUrls } from "./email";
import { hashToken, isTokenShape, newToken } from "./token";

describe("tokens", () => {
  it("are 256-bit base64url and hash to sha256 hex", () => {
    const t = newToken();
    expect(isTokenShape(t)).toBe(true);
    expect(newToken()).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
  });

  it("rejects anything else", () => {
    for (const bad of [
      undefined,
      "",
      "short",
      `${"a".repeat(42)}!`,
      "a".repeat(44),
    ])
      expect(isTokenShape(bad)).toBe(false);
  });
});

describe("inviteEmail", () => {
  const urls = respondUrls("https://bs.example/", "TOKEN");

  it("links to the respond page with each action", () => {
    expect(urls).toEqual({
      confirm:
        "https://bs.example/teammates/respond?token=TOKEN&action=confirm",
      decline:
        "https://bs.example/teammates/respond?token=TOKEN&action=decline",
    });
  });

  const base = {
    requesterName: "Ava Chen",
    recipientName: "Ben Ruiz",
    confirmUrl: urls.confirm,
    declineUrl: urls.decline,
    appUrl: "https://bs.example/",
  };

  it("subject names Builder Society, or the project when there is one", () => {
    expect(inviteEmail(base).subject).toBe(
      "Ava Chen added you as a teammate on Builder Society",
    );
    expect(inviteEmail({ ...base, project: "Route Planner" }).subject).toBe(
      "Ava Chen added you as a teammate on Route Planner",
    );
  });

  it("keeps the subject on one line", () => {
    expect(
      inviteEmail({ ...base, requesterName: "Ava\r\nBcc: x@y.z" }).subject,
    ).toBe("Ava Bcc: x@y.z added you as a teammate on Builder Society");
  });

  it("plain text has the whole message and both links", () => {
    const { text } = inviteEmail({ ...base, project: "Route Planner" });
    expect(text.split("\n")).toEqual([
      "Hi Ben,",
      "",
      "Ava Chen listed you as a teammate on Builder Society, for Route Planner.",
      "",
      "Building together? Confirm it and you'll show up on each other's builder files. Not working together? Decline, or ignore this email and nothing happens.",
      "",
      `Confirm teammate: ${urls.confirm}`,
      `Decline: ${urls.decline}`,
      "",
      "You'll sign in with your Lehigh Google account. Each link works once and expires in 14 days. You can also answer from your profile at https://bs.example.",
      "",
      "Builder Society. Questions? Reply to this email and it goes to the club.",
    ]);
    expect(inviteEmail(base).text).toContain(
      "Ava Chen listed you as a teammate on Builder Society.\n",
    );
  });

  it("HTML has the same copy and real links to /teammates/respond", () => {
    const { html } = inviteEmail({ ...base, project: "Route Planner" });
    expect(html).toContain("Hi Ben,");
    expect(html).toContain(
      "Ava Chen listed you as a teammate on Builder Society, for Route Planner.",
    );
    expect(html).toContain("Not working together? Decline, or ignore");
    for (const [href, label] of [
      [urls.confirm, "Confirm teammate"],
      [urls.decline, "Decline"],
    ])
      expect(html).toMatch(
        new RegExp(
          `<a href="${href.replace(/&/g, "&amp;").replace(/[?.]/g, "\\$&")}"[^>]*>${label}</a>`,
        ),
      );
    expect(html).toContain('<a href="https://bs.example"');
    expect(html).toContain("expires in 14 days");
    expect(html).toContain("Reply to this email and it goes to the club.");
  });

  it("never says whether the requester hears about a decline", () => {
    const { text, html } = inviteEmail(base);
    for (const body of [text, html])
      expect(body).not.toMatch(
        /won.t (be told|know)|will (be told|know)|notif/i,
      );
  });

  it("escapes the requester name and project everywhere in the HTML", () => {
    const e = inviteEmail({
      ...base,
      requesterName: "<b>Eve</b>",
      project: `<img src=x onerror="x()"> & Co`,
    });
    expect(e.html).not.toContain("<b>Eve</b>");
    expect(e.html).not.toContain("<img");
    expect(e.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(e.html).toContain(
      "for &lt;img src=x onerror=&quot;x()&quot;&gt; &amp; Co.",
    );
    // Subject and text/plain aren't HTML, so they stay as typed.
    expect(e.subject).toBe(
      `<b>Eve</b> added you as a teammate on <img src=x onerror="x()"> & Co`,
    );
  });
});
