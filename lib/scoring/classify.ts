// Message classification with Claude: pure request building and response parsing.
// No I/O here. score-messages.ts decides which messages to send and how to send
// them, so swapping the realtime Messages API for the Batch API only swaps the
// executor (requests are plain MessageCreateParamsNonStreaming either way).
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { isRankable, type EligibilityFields } from "./eligibility";

export const CLASSIFIER = {
  model: "claude-haiku-5-5",
  effort: "medium",
  batchSize: 20,
  maxTokens: 8000,
  minChars: 15,
  // USD per million tokens, Anthropic list price for claude-haiku-5-5 (prompts
  // ≤100K tokens). Cache multipliers are the standard 1.25× write / 0.1× read.
  pricing: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
} as const;

// The model never awards "shipped" directly: it flags shipped_candidate, which
// counts as progress until an exec member approves it (shipped_approvals).
export const CATEGORIES = [
  "progress_update",
  "shipped_candidate",
  "help_given",
  "event_related",
  "chatter",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type ClassifiableMessage = {
  id: string;
  memberId: string;
  createdAt: string;
  /** Project names already recorded for this author before this message. */
  authorProjects: string[];
  text: string;
  channel: string;
  hasMedia: boolean;
  replyToText: string | null;
};

export type MessageScore = {
  message_id: string;
  category: Category;
  substance: 0 | 1 | 2 | 3;
  summary: string;
  project: string | null;
  model: string;
};

// ─── Eligibility ────────────────────────────────────────────────────────────

const DELETED_TEXT = "This message was deleted";

/** The "👋 Introductions" subtopic (matched by name, emoji and case aside). */
export const isIntroductionsChannel = (channel: string) =>
  /introductions/i.test(channel);

/**
 * Hard rules applied after the model answers. Introductions are never
 * shipped candidates (organizer rule), whatever the model says.
 */
export function applyChannelRules(
  category: Category,
  channel: string,
): Category {
  if (category === "shipped_candidate" && isIntroductionsChannel(channel)) {
    return "chatter";
  }
  return category;
}

export type SkipReason =
  "not_user" | "no_member" | "excluded_or_inactive" | "too_short" | "deleted";

/** Why a message shouldn't be sent to the classifier, or null if it should. */
export function skipReason(
  msg: { sender_type: string; text: string | null },
  member: EligibilityFields | null,
): SkipReason | null {
  if (msg.sender_type !== "user") return "not_user";
  if (!member) return "no_member";
  if (!isRankable(member)) return "excluded_or_inactive";
  const text = (msg.text ?? "").trim();
  if (text === DELETED_TEXT) return "deleted";
  if (text.length < CLASSIFIER.minChars) return "too_short";
  return null;
}

// ─── Request ────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You classify messages from the GroupMe chat of AI Builder Society, a university club where members build their own AI and software projects. Members post a weekly goal on Mondays and progress on Fridays. Your labels feed a members' leaderboard, so judge what the author actually did or said, not how enthusiastic it sounds.

For each message, return its category, substance, summary, and project.

Categories:
- progress_update: the author reports work on their own project: what they did, results, problems they hit, or a goal or plan for it. Weekly goal posts count. So does explaining how their own project works.
- shipped_candidate: the author may have shipped something that others can see or use. An organizer reviews every candidate, so flag anything plausible. Evidence is required: a live link, a demo video or screenshots of it working, or an explicit statement that it is live, launched, released, or available to users (for example "the app is live on the App Store"). If the message is mainly a weekly goal but states the product is live, it is still a candidate. Plans, research findings, and things described only as "built" or "running" with no link, media, or launch statement are progress_update.
- help_given: the author gives help to someone else: answers a question, gives feedback or suggestions on another member's project, or offers relevant experience. Sharing a useful article, link, tool, tutorial, or resource with the group is help_given in any channel, even with a short comment like "thought this was interesting". Asking someone a question is not help_given.
- event_related: announcing or organizing a meeting or event: times, places, RSVPs, reminders, schedule changes. A member saying they can't attend, or asking what they missed, is chatter.
- chatter: everything else: greetings, introductions, reactions, hype, jokes, or questions that don't help anyone.

Introductions are chatter even when they describe a project idea. An introduction is a self-introduction (name, year, major, interests), usually in the Introductions channel. A weekly goal or progress post that just opens with "Hi, I'm X" is not an introduction.

Substance (how much concrete content, 0-3):
0: none. Reactions, one-liners, filler.
1: vague. Names a topic or intention without specifics ("my goal is to advertise", "working on my app").
2: specific. Names a concrete task, feature, fix, decision, or result, even briefly ("add Stripe checkout to the signup page", "fixed the login bug and wrote tests for it").
3: detailed. Concrete results with numbers, technical detail, lessons learned, or shared evidence like screenshots or demos ("raised model accuracy from 60% to 85% by retraining on new data").

Summary: one neutral sentence of at most 15 words saying what the author did or said. Third person, no names (for example: "Raised model accuracy from 60% to 85% and is now improving data labeling.").

Project: the author's own project that the message is about. Each message lists the author's known projects (author_projects) from earlier messages. If the message is about one of them, return that name exactly as listed, even if the author describes it differently this time. Otherwise use the name the author writes (for example "Muggy" or "HawkHousing"), or if it's unnamed, a short lowercase description ("ai budgeting app"). Messages in this batch with the same author key are by the same person, so keep their project names consistent. Use an empty string when the message isn't about the author's own project, such as help for someone else, events, or chatter.

Each message comes with an anonymous author key, the author's known projects, its channel, whether an image or video is attached, and, for replies, the text it replies to. Classify only the author's own message; the reply text is context.

Return exactly one result per message, using its ref.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "string" },
          category: { type: "string", enum: [...CATEGORIES] },
          substance: { type: "integer", enum: [0, 1, 2, 3] },
          summary: { type: "string" },
          project: { type: "string" },
        },
        required: ["ref", "category", "substance", "summary", "project"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

const REPLY_CONTEXT_CHARS = 300;

/** One Messages API request for up to CLASSIFIER.batchSize messages. */
export function buildClassifyRequest(
  batch: ClassifiableMessage[],
): Anthropic.MessageCreateParamsNonStreaming {
  // Anonymous per-batch author keys (a1, a2, ...): links messages by the same
  // person without sending names.
  const authorKeys = new Map<string, string>();
  for (const m of batch) {
    if (!authorKeys.has(m.memberId)) {
      authorKeys.set(m.memberId, `a${authorKeys.size + 1}`);
    }
  }

  const items = batch.map((m, i) => ({
    ref: `m${i + 1}`,
    author: authorKeys.get(m.memberId),
    author_projects: m.authorProjects,
    channel: m.channel,
    has_media: m.hasMedia,
    ...(m.replyToText
      ? { reply_to: m.replyToText.slice(0, REPLY_CONTEXT_CHARS) }
      : {}),
    text: m.text,
  }));

  return {
    model: CLASSIFIER.model,
    max_tokens: CLASSIFIER.maxTokens,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: CLASSIFIER.effort,
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Classify these ${items.length} messages:\n\n${JSON.stringify(items, null, 2)}`,
      },
    ],
  };
}

// ─── Response ───────────────────────────────────────────────────────────────

const ResultSchema = z.object({
  results: z.array(
    z.object({
      ref: z.string(),
      category: z.enum(CATEGORIES),
      substance: z.union([
        z.literal(0),
        z.literal(1),
        z.literal(2),
        z.literal(3),
      ]),
      summary: z.string(),
      project: z.string(),
    }),
  ),
});

export type ParsedBatch = {
  scores: MessageScore[];
  /** Message ids with no valid result; they stay unscored and retry next run. */
  missing: string[];
  error: string | null;
};

/** Maps a response back onto the batch it was built from. */
export function parseClassifyResponse(
  batch: ClassifiableMessage[],
  response: Anthropic.Message,
): ParsedBatch {
  const allMissing = (error: string): ParsedBatch => ({
    scores: [],
    missing: batch.map((m) => m.id),
    error,
  });

  if (response.stop_reason === "refusal") {
    return allMissing(
      `refusal (${response.stop_details?.category ?? "no category"})`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    return allMissing("hit max_tokens");
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: z.infer<typeof ResultSchema>;
  try {
    parsed = ResultSchema.parse(JSON.parse(text));
  } catch (err) {
    return allMissing(
      `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const byRef = new Map(parsed.results.map((r) => [r.ref, r]));
  const scores: MessageScore[] = [];
  const missing: string[] = [];
  batch.forEach((m, i) => {
    const r = byRef.get(`m${i + 1}`);
    if (!r) {
      missing.push(m.id);
      return;
    }
    scores.push({
      message_id: m.id,
      category: applyChannelRules(r.category, m.channel),
      substance: r.substance,
      summary: r.summary.trim(),
      project: r.project.trim() || null,
      model: response.model,
    });
  });
  return { scores, missing, error: missing.length ? "missing refs" : null };
}

// ─── Usage & cost ───────────────────────────────────────────────────────────

export type TokenUsage = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

export const emptyUsage = (): TokenUsage => ({
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
});

export function addUsage(total: TokenUsage, usage: Anthropic.Usage): void {
  total.input += usage.input_tokens;
  total.output += usage.output_tokens;
  total.cacheWrite += usage.cache_creation_input_tokens ?? 0;
  total.cacheRead += usage.cache_read_input_tokens ?? 0;
}

export function costUsd(u: TokenUsage): number {
  const p = CLASSIFIER.pricing;
  return (
    (u.input * p.input +
      u.output * p.output +
      u.cacheWrite * p.cacheWrite +
      u.cacheRead * p.cacheRead) /
    1_000_000
  );
}
