// sendEmail: Reply-To defaults to the club inbox, EMAIL_REPLY_TO overrides it,
// and nothing is sent when email isn't configured.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { DEFAULT_REPLY_TO, replyToAddress, sendEmail } = await import("./email");

const msg = { to: "ben@lehigh.edu", subject: "s", text: "t", html: "<p>h</p>" };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ id: "em_1" }), { status: 200 }),
  );
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv(
    "EMAIL_FROM",
    "Builder Society <builder-society@mail.joliegoldstein.com>",
  );
  vi.stubEnv("EMAIL_REPLY_TO", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const sentBody = () =>
  JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<
    string,
    unknown
  >;

describe("replyToAddress", () => {
  it("defaults to the club inbox", () => {
    expect(DEFAULT_REPLY_TO).toBe("inaiclub@lehigh.edu");
    expect(replyToAddress({})).toBe("inaiclub@lehigh.edu");
    expect(replyToAddress({ EMAIL_REPLY_TO: "  " })).toBe(
      "inaiclub@lehigh.edu",
    );
  });

  it("uses EMAIL_REPLY_TO when it's a single address", () => {
    expect(replyToAddress({ EMAIL_REPLY_TO: " exec@lehigh.edu " })).toBe(
      "exec@lehigh.edu",
    );
    for (const bad of ["not-an-address", "a@b.c, d@e.f", "a@b.c\r\nBcc: x@y.z"])
      expect(replyToAddress({ EMAIL_REPLY_TO: bad })).toBe(DEFAULT_REPLY_TO);
  });
});

describe("sendEmail", () => {
  it("sends from EMAIL_FROM with Reply-To set to the club by default", async () => {
    expect(await sendEmail(msg)).toEqual({ ok: true, id: "em_1" });
    expect(sentBody()).toMatchObject({
      from: "Builder Society <builder-society@mail.joliegoldstein.com>",
      reply_to: "inaiclub@lehigh.edu",
      to: ["ben@lehigh.edu"],
      subject: "s",
      text: "t",
      html: "<p>h</p>",
    });
  });

  it("uses EMAIL_REPLY_TO when set", async () => {
    vi.stubEnv("EMAIL_REPLY_TO", "exec@lehigh.edu");
    await sendEmail(msg);
    expect(sentBody().reply_to).toBe("exec@lehigh.edu");
  });

  it("doesn't call Resend when it isn't configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendEmail(msg)).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
