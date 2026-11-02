import { describe, expect, it } from "vitest";
import {
  partitionLinks,
  requestOutcome,
  tokenProblem,
  type LinkRow,
} from "./rules";

const ME = "me";
const person = (id: string, name: string) => ({
  id,
  display_name: name,
  avatar_url: null,
});
const link = (
  o: Partial<LinkRow> & Pick<LinkRow, "id" | "requester_id" | "recipient_id">,
): LinkRow => ({
  status: "pending",
  email_status: "sent",
  requester: person(o.requester_id, `Name ${o.requester_id}`),
  recipient: person(o.recipient_id, `Name ${o.recipient_id}`),
  ...o,
});

describe("partitionLinks", () => {
  it("splits confirmed, incoming and outgoing, each showing the other person", () => {
    const lists = partitionLinks(
      [
        link({
          id: "1",
          requester_id: ME,
          recipient_id: "b",
          status: "confirmed",
        }),
        link({
          id: "2",
          requester_id: "c",
          recipient_id: ME,
          status: "confirmed",
        }),
        link({ id: "3", requester_id: "d", recipient_id: ME }),
        link({
          id: "4",
          requester_id: ME,
          recipient_id: "e",
          email_status: "failed",
        }),
      ],
      ME,
    );
    expect(lists.confirmed.map((t) => t.member.id)).toEqual(["b", "c"]);
    expect(lists.incoming.map((t) => t.member.id)).toEqual(["d"]);
    expect(lists.outgoing).toEqual([
      {
        linkId: "4",
        member: { id: "e", name: "Name e", avatarUrl: null },
        emailFailed: true,
      },
    ]);
  });

  it("never shows declined requests or other people's links", () => {
    const lists = partitionLinks(
      [
        link({
          id: "1",
          requester_id: ME,
          recipient_id: "b",
          status: "declined",
        }),
        link({
          id: "2",
          requester_id: "c",
          recipient_id: ME,
          status: "declined",
        }),
        link({
          id: "3",
          requester_id: "x",
          recipient_id: "y",
          status: "confirmed",
        }),
      ],
      ME,
    );
    expect(lists).toEqual({ confirmed: [], incoming: [], outgoing: [] });
  });

  it("sorts by name", () => {
    const lists = partitionLinks(
      [
        link({
          id: "1",
          requester_id: ME,
          recipient_id: "z",
          status: "confirmed",
          recipient: person("z", "Zoe"),
        }),
        link({
          id: "2",
          requester_id: ME,
          recipient_id: "a",
          status: "confirmed",
          recipient: person("a", "Avi"),
        }),
      ],
      ME,
    );
    expect(lists.confirmed.map((t) => t.member.name)).toEqual(["Avi", "Zoe"]);
  });
});

describe("requestOutcome", () => {
  it("passes pending and auto-confirmed requests through", () => {
    expect(requestOutcome({ result: "pending", link_id: "L" })).toEqual({
      ok: true,
      status: "pending",
      linkId: "L",
    });
    expect(requestOutcome({ result: "confirmed", link_id: "L" })).toEqual({
      ok: true,
      status: "confirmed",
      linkId: "L",
    });
  });

  it.each([
    ["self", 400],
    ["not_roster", 404],
    ["already_teammates", 409],
    ["already_pending", 409],
    ["cooldown", 409],
    ["something_new", 400],
  ])("rejects %s with %i", (result, status) => {
    expect(requestOutcome({ result })).toMatchObject({ ok: false, status });
  });

  it("says when the cooldown ends", () => {
    const r = requestOutcome({
      result: "cooldown",
      until: "2026-12-02T15:00:00+00:00",
    });
    expect(r.ok || r.error).toMatch(/until Dec 2/);
  });
});

describe("tokenProblem", () => {
  it("has nothing to say about a usable link", () => {
    expect(tokenProblem("ok")).toBeNull();
  });

  it.each(["invalid", "not_yours", "used", "expired", "not_found"] as const)(
    "explains %s",
    (r) => {
      expect(tokenProblem(r)?.title).toBeTruthy();
    },
  );

  it("tells a confirmed teammate they're already linked", () => {
    expect(
      tokenProblem("used", { status: "confirmed", requesterName: "Ava" })?.body,
    ).toBe("You and Ava are already teammates.");
  });

  it("never names the requester to the wrong account", () => {
    expect(
      tokenProblem("not_yours", { requesterName: "Ava" })?.body,
    ).not.toMatch(/Ava/);
  });
});
