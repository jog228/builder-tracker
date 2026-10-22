// "Now Building" profile card: which updates feed a member's summary, when to
// regenerate it, the Claude request and its validation, and what the card
// shows. Pure; refresh.ts does the I/O.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { isRankable, type EligibilityFields } from "@/lib/scoring/eligibility";
import { resolveProject, type AliasMap } from "@/lib/scoring/projects";
import { earnsProgressPoints, isUpdate } from "@/lib/scoring/updates";

export const SUMMARIZER = {
  model: "claude-haiku-5-5",
  effort: "low",
  maxTokens: 600,
  /** Updates from this many days before the member's latest one. */
  windowDays: 28,
  maxUpdates: 12,
  /** Per-post text sent to the model. */
  maxPostChars: 1200,
  targetWords: 35,
  /** Hard cap after cleanup; the prompt asks for ~35. */
  maxWords: 50,
  // Same list price as the classifier (claude-haiku-5-5), USD per 1M tokens.
  pricing: { input: 0.1, output: 0.5 },
} as const;

export const NO_UPDATES_TEXT =
  "No updates yet: post your progress in GroupMe to fill this in.";
export const PENDING_TEXT =
  "Summary on the way: it refreshes after the next scoring run.";

// ─── Which updates ──────────────────────────────────────────────────────────

export type ScoredUpdate = {
  id: string;
  createdAt: string;
  text: string;
  /** Effective category (after any exec shipped decision). */
  category: string;
  substance: number;
  project: string | null;
};

/** A real update: a progress or shipped post that earns points. */
const isRealUpdate = (u: ScoredUpdate) =>
  isUpdate(u) && (u.category === "shipped" || earnsProgressPoints(u));

/**
 * The updates a summary is built from, oldest first: real updates from the
 * `windowDays` before the member's latest one (so a member who's been quiet
 * for a month still gets a summary of their last stretch), at most
 * `maxUpdates` of the newest.
 */
export function sourceUpdates(updates: ScoredUpdate[]): ScoredUpdate[] {
  const real = updates
    .filter(isRealUpdate)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!real.length) return [];
  const latest = Date.parse(real.at(-1)!.createdAt);
  const from = latest - SUMMARIZER.windowDays * 86_400_000;
  return real
    .filter((u) => Date.parse(u.createdAt) > from)
    .slice(-SUMMARIZER.maxUpdates);
}

/** The project on the newest update that names one, with admin aliases. */
export function currentProject(
  memberId: string,
  updates: ScoredUpdate[],
  aliases: AliasMap,
): string | null {
  const named = [...updates]
    .filter((u) => isRealUpdate(u) && u.project)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return named ? resolveProject(memberId, named.project, aliases) : null;
}

/** Regenerate only when there's an update the stored summary hasn't seen. */
export function needsRegeneration(
  storedSourceIds: string[] | null,
  source: ScoredUpdate[],
): boolean {
  if (!source.length) return false;
  if (!storedSourceIds) return true;
  const seen = new Set(storedSourceIds);
  return source.some((u) => !seen.has(u.id));
}

// ─── Request ────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You write the "Now Building" line on a member's profile for AI Builder Society, a university club where members build their own AI and software projects. You get the member's recent progress posts from the club chat.

Write 1 or 2 sentences, about ${SUMMARIZER.targetWords} words, in the present tense: what they are building and their latest progress.

Rules:
- Use only facts stated in the posts. Never invent features, numbers, users, launches, dates or plans.
- No hype or marketing language ("revolutionary", "exciting", "game-changing", "cutting-edge", and so on) and no exclamation marks.
- Never name any person. Posts may mention other people (shown as [member]); leave them out. Don't refer to the builder by name or pronoun; start with a verb ("Building…", "Adding…") or the project name.
- Don't mention the chat, posts, points or the club.
- If the posts are vague, say less rather than filling gaps.
- At most 2 sentences. Plain text, no lists or quotes.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
  additionalProperties: false,
} as const;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces members' full names with "[member]" (case-insensitive, whole words). */
export function redactNames(text: string, names: string[]): string {
  let out = text;
  for (const name of names.filter((n) => n.trim().length >= 3)) {
    out = out.replace(
      new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRe(name.trim())}(?![\\p{L}\\p{N}])`,
        "giu",
      ),
      "[member]",
    );
  }
  return out;
}

/** The Claude request for one member. Sends no names. */
export function buildSummaryRequest(
  project: string | null,
  source: ScoredUpdate[],
  memberNames: string[],
): Anthropic.MessageCreateParamsNonStreaming {
  const posts = source.map((u) => ({
    date: u.createdAt.slice(0, 10),
    ...(u.project ? { project: u.project } : {}),
    text: redactNames(u.text, memberNames).slice(0, SUMMARIZER.maxPostChars),
  }));
  return {
    model: SUMMARIZER.model,
    max_tokens: SUMMARIZER.maxTokens,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: SUMMARIZER.effort,
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Current project: ${project ?? "(not named)"}\n\nPosts, oldest first:\n${JSON.stringify(posts, null, 2)}`,
      },
    ],
  };
}

// ─── Response ───────────────────────────────────────────────────────────────

/** Whitespace collapsed, at most 2 sentences and `maxWords` words. */
export function cleanSummary(text: string): string {
  const flat = text.replace(/\s+/g, " ").replace(/!/g, ".").trim();
  // A sentence ends at . or ? followed by a space and a capital or digit, so
  // "v2.0" and "Next.js" stay intact.
  const sentences = flat.split(/(?<=[.?])\s+(?=[A-Z0-9"'(])/);
  let out = sentences.slice(0, 2).join(" ").trim();
  const words = out.split(" ");
  if (words.length > SUMMARIZER.maxWords)
    out = `${words
      .slice(0, SUMMARIZER.maxWords)
      .join(" ")
      .replace(/[,;:]$/, "")}…`;
  return out;
}

/** A member name (full, or a first name of 4+ letters) appearing in `text`. */
export function nameIn(text: string, names: string[]): string | null {
  const candidates = names.flatMap((n) => {
    const full = n.trim();
    const first = full.split(/\s+/)[0];
    return [
      full,
      ...(first && first.length >= 4 && first !== full ? [first] : []),
    ];
  });
  for (const c of candidates.filter((c) => c.length >= 3)) {
    if (
      new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRe(c)}(?![\\p{L}\\p{N}])`,
        "iu",
      ).test(text)
    )
      return c;
  }
  return null;
}

export type ParsedSummary =
  { ok: true; summary: string } | { ok: false; error: string };

export function parseSummaryResponse(
  response: Anthropic.Message,
  memberNames: string[],
): ParsedSummary {
  if (response.stop_reason === "refusal")
    return { ok: false, error: "refusal" };
  if (response.stop_reason === "max_tokens")
    return { ok: false, error: "hit max_tokens" };
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let summary: string;
  try {
    summary = z.object({ summary: z.string() }).parse(JSON.parse(text)).summary;
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  summary = cleanSummary(summary);
  if (!summary) return { ok: false, error: "empty summary" };
  const named = nameIn(summary, memberNames);
  if (named) return { ok: false, error: `named a member (${named})` };
  return { ok: true, summary };
}

export function usageCostUsd(u: { input: number; output: number }): number {
  const p = SUMMARIZER.pricing;
  return (u.input * p.input + u.output * p.output) / 1_000_000;
}

// ─── What the card shows ────────────────────────────────────────────────────

export type SummaryRow = {
  project: string | null;
  summary: string | null;
  update_count: number;
  last_post_at: string | null;
  generated_at: string | null;
  override_summary: string | null;
  override_by_name: string | null;
  override_at: string | null;
};

export type NowBuildingCard =
  | null // no card (exec board / inactive)
  | {
      kind: "summary";
      project: string | null;
      text: string;
      updateCount: number;
      lastPostAt: string | null;
      generated: string | null;
      edited: { by: string | null; at: string | null } | null;
    }
  | { kind: "empty"; text: string; pending: boolean };

/**
 * The card for a profile. Exec board (and inactive) members get none. An
 * admin override wins over the generated text. With no summary yet: the
 * "no updates" prompt, or "on the way" if they have updates waiting.
 */
export function nowBuildingCard(
  member: EligibilityFields,
  row: SummaryRow | null,
  hasUpdates: boolean,
): NowBuildingCard {
  if (!isRankable(member)) return null;
  const text = row?.override_summary?.trim() || row?.summary?.trim();
  if (row && text) {
    return {
      kind: "summary",
      project: row.project,
      text,
      updateCount: row.update_count,
      lastPostAt: row.last_post_at,
      generated: row.summary,
      edited: row.override_summary?.trim()
        ? { by: row.override_by_name, at: row.override_at }
        : null,
    };
  }
  return hasUpdates
    ? { kind: "empty", text: PENDING_TEXT, pending: true }
    : { kind: "empty", text: NO_UPDATES_TEXT, pending: false };
}
