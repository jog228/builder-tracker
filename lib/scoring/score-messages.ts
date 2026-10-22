// Scores unscored GroupMe messages with Claude and saves them to message_scores.
// Used by the cron route, the score-messages script, and the eval script.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLASSIFIER,
  addUsage,
  buildClassifyRequest,
  costUsd,
  emptyUsage,
  parseClassifyResponse,
  skipReason,
  type ClassifiableMessage,
  type MessageScore,
  type SkipReason,
  type TokenUsage,
} from "./classify";

// ─── Executors ──────────────────────────────────────────────────────────────
// An executor turns requests into responses. The realtime one calls the
// Messages API directly; a Batch API executor (batches.create → poll →
// results, keyed by custom_id) can be dropped in when volume grows.

export type ClassifyRequest = {
  customId: string;
  params: Anthropic.MessageCreateParamsNonStreaming;
};
export type ClassifyExecutor = (
  requests: ClassifyRequest[],
) => Promise<Map<string, Anthropic.Message | Error>>;

export function realtimeExecutor(
  client = new Anthropic(),
  concurrency = 4,
): ClassifyExecutor {
  return async (requests) => {
    const results = new Map<string, Anthropic.Message | Error>();
    let next = 0;
    const worker = async () => {
      while (next < requests.length) {
        const req = requests[next++];
        try {
          results.set(req.customId, await client.messages.create(req.params));
        } catch (err) {
          results.set(
            req.customId,
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
  };
}

// ─── Loading ────────────────────────────────────────────────────────────────

const PAGE = 1000;

async function fetchAll<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

type MessageRow = {
  id: string;
  text: string | null;
  sender_type: string;
  member_id: string | null;
  channel_name: string | null;
  has_attachment: boolean;
  reply_to_id: string | null;
};

const MESSAGE_COLUMNS =
  "id, text, sender_type, member_id, channel_name, has_attachment, reply_to_id";

/** Attaches reply context and shapes rows for the classifier. */
async function toClassifiable(
  db: SupabaseClient,
  rows: MessageRow[],
): Promise<ClassifiableMessage[]> {
  const parentIds = [
    ...new Set(rows.map((r) => r.reply_to_id).filter(Boolean)),
  ] as string[];
  const parents = new Map<string, string>();
  for (let i = 0; i < parentIds.length; i += 200) {
    const { data, error } = await db
      .from("messages")
      .select("id, text")
      .in("id", parentIds.slice(i, i + 200));
    if (error) throw error;
    data.forEach((p) => p.text && parents.set(p.id, p.text));
  }

  return rows.map((r) => ({
    id: r.id,
    text: (r.text ?? "").trim(),
    channel: r.channel_name ?? "Main",
    hasMedia: r.has_attachment,
    replyToText: r.reply_to_id ? (parents.get(r.reply_to_id) ?? null) : null,
  }));
}

/** Loads specific messages for the classifier (used by the eval script). */
export async function loadClassifiable(
  db: SupabaseClient,
  ids: string[],
): Promise<ClassifiableMessage[]> {
  const { data, error } = await db
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .in("id", ids);
  if (error) throw error;
  return toClassifiable(db, data);
}

/** Every unscored message that may be scored, plus counts of what was skipped. */
async function loadUnscored(db: SupabaseClient) {
  const [messages, scored, members] = await Promise.all([
    fetchAll<MessageRow>((from, to) =>
      db
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("sender_type", "user")
        .order("created_at")
        .range(from, to),
    ),
    fetchAll<{ message_id: string }>((from, to) =>
      db.from("message_scores").select("message_id").range(from, to),
    ),
    fetchAll<{ id: string; active: boolean; exclude_from_rankings: boolean }>(
      (from, to) =>
        db
          .from("members")
          .select("id, active, exclude_from_rankings")
          .range(from, to),
    ),
  ]);

  const scoredIds = new Set(scored.map((s) => s.message_id));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const skipped: Partial<Record<SkipReason, number>> = {};
  const eligible: MessageRow[] = [];

  for (const m of messages) {
    if (scoredIds.has(m.id)) continue;
    const reason = skipReason(
      m,
      m.member_id ? (memberById.get(m.member_id) ?? null) : null,
    );
    if (reason) skipped[reason] = (skipped[reason] ?? 0) + 1;
    else eligible.push(m);
  }
  return {
    eligible: await toClassifiable(db, eligible),
    skipped,
    alreadyScored: scoredIds.size,
  };
}

// ─── Classifying ────────────────────────────────────────────────────────────

export type ClassifyOutcome = {
  scores: MessageScore[];
  failed: { id: string; error: string }[];
  usage: TokenUsage;
  requests: number;
};

/** Classifies messages in batches of CLASSIFIER.batchSize. Writes nothing. */
export async function classifyMessages(
  messages: ClassifiableMessage[],
  executor: ClassifyExecutor = realtimeExecutor(),
): Promise<ClassifyOutcome> {
  const batches: ClassifiableMessage[][] = [];
  for (let i = 0; i < messages.length; i += CLASSIFIER.batchSize) {
    batches.push(messages.slice(i, i + CLASSIFIER.batchSize));
  }

  const responses = await executor(
    batches.map((batch, i) => ({
      customId: `batch-${i}`,
      params: buildClassifyRequest(batch),
    })),
  );

  const outcome: ClassifyOutcome = {
    scores: [],
    failed: [],
    usage: emptyUsage(),
    requests: batches.length,
  };
  batches.forEach((batch, i) => {
    const res = responses.get(`batch-${i}`);
    if (!res || res instanceof Error) {
      const error = res?.message ?? "no response";
      batch.forEach((m) => outcome.failed.push({ id: m.id, error }));
      return;
    }
    addUsage(outcome.usage, res.usage);
    const parsed = parseClassifyResponse(batch, res);
    outcome.scores.push(...parsed.scores);
    parsed.missing.forEach((id) =>
      outcome.failed.push({ id, error: parsed.error ?? "missing" }),
    );
  });
  return outcome;
}

// ─── Run ────────────────────────────────────────────────────────────────────

export type ScoreRunStats = {
  model: string;
  alreadyScored: number;
  eligible: number;
  scored: number;
  failed: number;
  skipped: Partial<Record<SkipReason, number>>;
  requests: number;
  usage: TokenUsage;
  costUsd: number;
  costPer1kMessages: number | null;
  errors: string[];
};

/** Scores every eligible unscored message and records the run in sync_runs. */
export async function scoreMessages(
  db: SupabaseClient,
  executor: ClassifyExecutor = realtimeExecutor(),
): Promise<ScoreRunStats & { runId: number }> {
  const { data: run, error: runError } = await db
    .from("sync_runs")
    .insert({ source: "score-messages" })
    .select("id")
    .single();
  if (runError) throw runError;

  try {
    const { eligible, skipped, alreadyScored } = await loadUnscored(db);
    const outcome = await classifyMessages(eligible, executor);

    if (outcome.scores.length) {
      const { error } = await db
        .from("message_scores")
        .upsert(outcome.scores, { onConflict: "message_id" });
      if (error) throw error;
    }

    const cost = costUsd(outcome.usage);
    const stats: ScoreRunStats = {
      model: CLASSIFIER.model,
      alreadyScored,
      eligible: eligible.length,
      scored: outcome.scores.length,
      failed: outcome.failed.length,
      skipped,
      requests: outcome.requests,
      usage: outcome.usage,
      costUsd: Number(cost.toFixed(6)),
      costPer1kMessages: outcome.scores.length
        ? Number(((cost / outcome.scores.length) * 1000).toFixed(4))
        : null,
      errors: [...new Set(outcome.failed.map((f) => f.error))],
    };

    await db
      .from("sync_runs")
      .update({
        status: outcome.failed.length ? "error" : "success",
        error: stats.errors.join("; ") || null,
        stats,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return { runId: run.id, ...stats };
  } catch (err) {
    await db
      .from("sync_runs")
      .update({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    throw err;
  }
}
