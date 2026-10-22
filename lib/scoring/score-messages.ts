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
import { KnownProjects, buildAliasMap, type ProjectAlias } from "./projects";

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
  created_at: string;
  text: string | null;
  sender_type: string;
  member_id: string | null;
  channel_name: string | null;
  has_attachment: boolean;
  reply_to_id: string | null;
};

const MESSAGE_COLUMNS =
  "id, created_at, text, sender_type, member_id, channel_name, has_attachment, reply_to_id";

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
    memberId: r.member_id ?? "",
    createdAt: r.created_at,
    authorProjects: [], // filled per batch by classifyMessages
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

type MessageRef = { member_id: string | null; created_at: string };

/**
 * Every project already recorded, with admin aliases applied: the starting
 * point for the author_projects context.
 */
export async function loadKnownProjects(
  db: SupabaseClient,
): Promise<KnownProjects> {
  const [scored, aliases] = await Promise.all([
    // Supabase types the embedded message as an array; it's a single row.
    fetchAll<{
      project: string | null;
      messages: MessageRef | MessageRef[];
    }>((from, to) =>
      db
        .from("message_scores")
        .select("project, messages!inner(member_id, created_at)")
        .not("project", "is", null)
        .range(from, to),
    ),
    fetchAll<ProjectAlias>((from, to) =>
      db
        .from("project_aliases")
        .select("member_id, alias, canonical")
        .range(from, to),
    ),
  ]);
  const known = new KnownProjects(buildAliasMap(aliases));
  for (const s of scored) {
    const msg = Array.isArray(s.messages) ? s.messages[0] : s.messages;
    if (msg?.member_id) known.add(msg.member_id, s.project, msg.created_at);
  }
  return known;
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

/**
 * Classifies messages in chronological batches of CLASSIFIER.batchSize. Writes
 * nothing. Batches run one after another so each sees the projects found in
 * earlier ones (author_projects). For the Batch API, submit one day's messages
 * per batch job to keep that ordering.
 */
export async function classifyMessages(
  messages: ClassifiableMessage[],
  known: KnownProjects,
  executor: ClassifyExecutor = realtimeExecutor(),
): Promise<ClassifyOutcome> {
  const ordered = [...messages].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const outcome: ClassifyOutcome = {
    scores: [],
    failed: [],
    usage: emptyUsage(),
    requests: 0,
  };

  for (let i = 0; i < ordered.length; i += CLASSIFIER.batchSize) {
    const batch = ordered.slice(i, i + CLASSIFIER.batchSize).map((m) => ({
      ...m,
      authorProjects: known.before(m.memberId, m.createdAt),
    }));
    const customId = `batch-${outcome.requests++}`;
    const res = (
      await executor([{ customId, params: buildClassifyRequest(batch) }])
    ).get(customId);

    if (!res || res instanceof Error) {
      const error = res?.message ?? "no response";
      batch.forEach((m) => outcome.failed.push({ id: m.id, error }));
      continue;
    }
    addUsage(outcome.usage, res.usage);
    const parsed = parseClassifyResponse(batch, res);
    outcome.scores.push(...parsed.scores);
    parsed.missing.forEach((id) =>
      outcome.failed.push({ id, error: parsed.error ?? "missing" }),
    );
    const byId = new Map(batch.map((m) => [m.id, m]));
    for (const score of parsed.scores) {
      const m = byId.get(score.message_id)!;
      known.add(m.memberId, score.project, m.createdAt);
    }
  }
  return outcome;
}

// ─── Run ────────────────────────────────────────────────────────────────────

export type ScoreRunStats = {
  model: string;
  alreadyScored: number;
  eligible: number;
  scored: number;
  shippedCandidates: number;
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
    const outcome = await classifyMessages(
      eligible,
      await loadKnownProjects(db),
      executor,
    );

    if (outcome.scores.length) {
      const { error } = await db
        .from("message_scores")
        .upsert(outcome.scores, { onConflict: "message_id" });
      if (error) throw error;
    }

    // Shipped candidates wait for an exec decision; until then they count as
    // progress. Existing reviews (pending or decided) are left untouched.
    const candidates = outcome.scores
      .filter((s) => s.category === "shipped_candidate")
      .map((s) => ({ message_id: s.message_id }));
    if (candidates.length) {
      const { error } = await db.from("shipped_approvals").upsert(candidates, {
        onConflict: "message_id",
        ignoreDuplicates: true,
      });
      if (error) throw error;
    }

    const cost = costUsd(outcome.usage);
    const stats: ScoreRunStats = {
      model: CLASSIFIER.model,
      alreadyScored,
      eligible: eligible.length,
      scored: outcome.scores.length,
      shippedCandidates: candidates.length,
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
