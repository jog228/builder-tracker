import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  CLASSIFIER,
  applyChannelRules,
  buildClassifyRequest,
  costUsd,
  parseClassifyResponse,
  skipReason,
  type ClassifiableMessage,
} from "./classify";

const member = { active: true, exclude_from_rankings: false };
const exec = { active: true, exclude_from_rankings: true };
const longText = "Finished the login flow and deployed it to staging";

describe("skipReason", () => {
  it("lets a normal member's message through", () => {
    expect(skipReason({ sender_type: "user", text: longText }, member)).toBe(
      null,
    );
  });

  it("never sends an exec board member's message to the API", () => {
    expect(skipReason({ sender_type: "user", text: longText }, exec)).toBe(
      "excluded_or_inactive",
    );
  });

  it("skips system, bot, short, deleted and unmatched messages", () => {
    expect(skipReason({ sender_type: "system", text: longText }, member)).toBe(
      "not_user",
    );
    expect(skipReason({ sender_type: "bot", text: longText }, member)).toBe(
      "not_user",
    );
    expect(skipReason({ sender_type: "user", text: "same here" }, member)).toBe(
      "too_short",
    );
    expect(
      skipReason(
        { sender_type: "user", text: "This message was deleted" },
        member,
      ),
    ).toBe("deleted");
    expect(skipReason({ sender_type: "user", text: longText }, null)).toBe(
      "no_member",
    );
  });
});

const batch: ClassifiableMessage[] = [
  {
    id: "111",
    memberId: "ana",
    createdAt: "2026-10-01T00:00:00Z",
    authorProjects: ["Kiwi"],
    text: longText,
    channel: "Main",
    hasMedia: false,
    replyToText: null,
  },
  {
    id: "222",
    memberId: "ben",
    createdAt: "2026-10-02T00:00:00Z",
    authorProjects: [],
    text: "Try Vetwork as a name!",
    channel: "Goals",
    hasMedia: false,
    replyToText: "Any name ideas?",
  },
];

const response = (text: string, stop_reason = "end_turn") =>
  ({
    model: CLASSIFIER.model,
    stop_reason,
    content: [{ type: "text", text }],
    usage: { input_tokens: 1000, output_tokens: 200 },
  }) as unknown as Anthropic.Message;

describe("buildClassifyRequest", () => {
  it("sends refs instead of GroupMe ids, plus reply context, and no names", () => {
    const req = buildClassifyRequest(batch);
    const body = req.messages[0].content as string;
    expect(body).toContain('"ref": "m1"');
    expect(body).toContain('"reply_to": "Any name ideas?"');
    expect(body).not.toContain("111");
    expect(req.output_config?.format?.type).toBe("json_schema");
  });
});

describe("buildClassifyRequest author context", () => {
  it("links same-author messages with anonymous keys and lists known projects", () => {
    const req = buildClassifyRequest([
      ...batch,
      { ...batch[0], id: "333", createdAt: "2026-10-03T00:00:00Z" },
    ]);
    const items = JSON.parse(
      (req.messages[0].content as string).replace(/^[^\[]*/, ""),
    );
    expect(items.map((i: { author: string }) => i.author)).toEqual([
      "a1",
      "a2",
      "a1",
    ]);
    expect(items[0].author_projects).toEqual(["Kiwi"]);
    expect(JSON.stringify(items)).not.toMatch(/ana|ben/);
  });
});

describe("parseClassifyResponse", () => {
  it("maps refs back to message ids", () => {
    const parsed = parseClassifyResponse(
      batch,
      response(
        JSON.stringify({
          results: [
            {
              ref: "m1",
              category: "shipped_candidate",
              substance: 2,
              summary: "Deployed login. ",
              project: " Kiwi ",
            },
            {
              ref: "m2",
              category: "help_given",
              substance: 1,
              summary: "Suggested a name.",
              project: "",
            },
          ],
        }),
      ),
    );
    expect(parsed.missing).toEqual([]);
    expect(parsed.scores).toEqual([
      {
        message_id: "111",
        category: "shipped_candidate",
        substance: 2,
        summary: "Deployed login.",
        project: "Kiwi",
        model: CLASSIFIER.model,
      },
      {
        message_id: "222",
        category: "help_given",
        substance: 1,
        summary: "Suggested a name.",
        project: null,
        model: CLASSIFIER.model,
      },
    ]);
  });

  it("leaves messages without a result unscored so they retry", () => {
    const parsed = parseClassifyResponse(
      batch,
      response(
        JSON.stringify({
          results: [
            {
              ref: "m1",
              category: "chatter",
              substance: 0,
              summary: "x",
              project: "",
            },
          ],
        }),
      ),
    );
    expect(parsed.scores.map((s) => s.message_id)).toEqual(["111"]);
    expect(parsed.missing).toEqual(["222"]);
  });

  it("rejects invalid categories, refusals and truncated output", () => {
    const bad = parseClassifyResponse(
      batch,
      response(
        JSON.stringify({
          results: [{ ref: "m1", category: "spam", substance: 0, summary: "" }],
        }),
      ),
    );
    expect(bad.scores).toEqual([]);
    expect(bad.missing).toEqual(["111", "222"]);

    expect(
      parseClassifyResponse(batch, response("", "refusal")).missing,
    ).toHaveLength(2);
    expect(
      parseClassifyResponse(batch, response('{"res', "max_tokens")).missing,
    ).toHaveLength(2);
  });
});

describe("costUsd", () => {
  it("prices claude-haiku-5-5 at $0.10 / $0.50 per million tokens", () => {
    expect(
      costUsd({
        input: 1_000_000,
        output: 1_000_000,
        cacheWrite: 0,
        cacheRead: 0,
      }),
    ).toBeCloseTo(0.6);
  });
});

describe("applyChannelRules", () => {
  it("never lets an Introductions message be a shipped candidate", () => {
    expect(applyChannelRules("shipped_candidate", "👋 Introductions")).toBe(
      "chatter",
    );
    expect(applyChannelRules("shipped_candidate", "🔥 Goals & Progress")).toBe(
      "shipped_candidate",
    );
    expect(applyChannelRules("help_given", "👋 Introductions")).toBe(
      "help_given",
    );
  });

  it("is applied when parsing a response", () => {
    const intro = [{ ...batch[0], channel: "👋 Introductions" }];
    const parsed = parseClassifyResponse(
      intro,
      response(
        JSON.stringify({
          results: [
            {
              ref: "m1",
              category: "shipped_candidate",
              substance: 2,
              summary: "Intro.",
              project: "Kiwi",
            },
          ],
        }),
      ),
    );
    expect(parsed.scores[0].category).toBe("chatter");
  });
});
