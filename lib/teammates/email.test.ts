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

  it("names the requester and carries both links", () => {
    const e = inviteEmail({
      requesterName: "Ava Chen",
      recipientName: "Ben Ruiz",
      confirmUrl: urls.confirm,
      declineUrl: urls.decline,
    });
    expect(e.subject).toBe("Ava Chen added you as a teammate");
    expect(e.text).toContain("Hey Ben,");
    expect(e.text).toContain(`Confirm: ${urls.confirm}`);
    expect(e.text).toContain(`Decline: ${urls.decline}`);
    expect(e.html).toContain(urls.confirm.replace(/&/g, "&amp;"));
  });

  it("shows the project name when there is one, escaped in the HTML", () => {
    const base = {
      requesterName: "Ava",
      recipientName: "Ben",
      confirmUrl: "c",
      declineUrl: "d",
    };
    const plain = inviteEmail(base);
    expect(plain.text).not.toContain("Project:");
    expect(plain.html).not.toContain("Project:");

    const e = inviteEmail({
      ...base,
      project: `<img src=x onerror="x()"> & Co`,
    });
    expect(e.text).toContain(`Project: <img src=x onerror="x()"> & Co`); // text/plain
    expect(e.html).not.toContain("<img");
    expect(e.html).toContain(
      "Project:</span> &lt;img src=x onerror=&quot;x()&quot;&gt; &amp; Co",
    );
  });

  it("escapes names in the HTML", () => {
    const e = inviteEmail({
      requesterName: "<b>Eve</b>",
      recipientName: "Ben",
      confirmUrl: "c",
      declineUrl: "d",
    });
    expect(e.html).not.toContain("<b>Eve</b>");
    expect(e.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
  });
});
