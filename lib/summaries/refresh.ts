// Regenerates "Now Building" summaries for members with new scored updates.
// Runs at the end of the message-scoring job (no cron of its own) and from
// `npm run refresh-summaries`. Uses the secret-key client (writes generated
// columns, which only the service role may).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassifyExecutor } from "@/lib/scoring/score-messages";
import { isRankable } from "@/lib/scoring/eligibility";
import { buildAliasMap, type ProjectAlias } from "@/lib/scoring/projects";
import { effectiveCategory, type ApprovalStatus } from "@/lib/scoring/shipped";
import { fetchAll, one } from "@/lib/supabase/fetch-all";
import {
  SUMMARIZER,
  buildSummaryRequest,
  currentProject,
  needsRegeneration,
  parseSummaryResponse,
  sourceUpdates,
  usageCostUsd,
  type ScoredUpdate,
} from "./now-building";

type ScoreRow = {
  category: string;
  substance: number;
  project: string | null;
  message_id: string;
  messages:
    | { member_id: string | null; created_at: string; text: string | null }
    | { member_id: string | null; created_at: string; text: string | null }[];
};

export type SummaryRunStats = {
  model: string;
  members: number;
  regenerated: number;
  unchanged: number;
  failed: number;
  errors: string[];
  usage: { input: number; output: number };
  costUsd: number;
};

export async function refreshMemberSummaries(
  db: SupabaseClient,
  executor: ClassifyExecutor,
  { force = false }: { force?: boolean } = {},
): Promise<SummaryRunStats> {
  const [members, scores, approvals, aliases, stored] = await Promise.all([
    fetchAll<{
      id: string;
      display_name: string;
      active: boolean;
      exclude_from_rankings: boolean;
    }>((f, t) =>
      db
        .from("members")
        .select("id, display_name, active, exclude_from_rankings")
        .range(f, t),
    ),
    fetchAll<ScoreRow>((f, t) =>
      db
        .from("message_scores")
        .select(
          "category, substance, project, message_id, messages!inner(member_id, created_at, text)",
        )
        .in("category", ["progress_update", "shipped_candidate"])
        .range(f, t),
    ),
    fetchAll<{ message_id: string; status: ApprovalStatus }>((f, t) =>
      db.from("shipped_approvals").select("message_id, status").range(f, t),
    ),
    fetchAll<ProjectAlias>((f, t) =>
      db
        .from("project_aliases")
        .select("member_id, alias, canonical")
        .range(f, t),
    ),
    fetchAll<{ member_id: string; source_message_ids: string[] }>((f, t) =>
      db
        .from("member_summaries")
        .select("member_id, source_message_ids")
        .range(f, t),
    ),
  ]);

  const approval = new Map(approvals.map((a) => [a.message_id, a.status]));
  const aliasMap = buildAliasMap(aliases);
  const storedIds = new Map(
    stored.map((s) => [s.member_id, s.source_message_ids]),
  );
  // Every member's name is redacted from what we send (and rejected in output).
  const names = members.map((m) => m.display_name);

  const byMember = new Map<string, ScoredUpdate[]>();
  for (const s of scores) {
    const msg = one(s.messages);
    if (!msg?.member_id) continue;
    const list = byMember.get(msg.member_id) ?? [];
    list.push({
      id: s.message_id,
      createdAt: msg.created_at,
      text: (msg.text ?? "").trim(),
      category: effectiveCategory(
        s.category,
        approval.get(s.message_id) ?? null,
      ),
      substance: s.substance,
      project: s.project,
    });
    byMember.set(msg.member_id, list);
  }

  // Exec board and inactive members never get a summary.
  const jobs = members
    .filter(isRankable)
    .map((m) => {
      const updates = byMember.get(m.id) ?? [];
      const source = sourceUpdates(updates);
      return {
        member: m,
        source,
        project: currentProject(m.id, updates, aliasMap),
      };
    })
    .filter(
      (j) =>
        j.source.length &&
        (force ||
          needsRegeneration(storedIds.get(j.member.id) ?? null, j.source)),
    );

  const responses = await executor(
    jobs.map((j) => ({
      customId: j.member.id,
      params: buildSummaryRequest(j.project, j.source, names),
    })),
  );

  const stats: SummaryRunStats = {
    model: SUMMARIZER.model,
    members: members.filter(isRankable).length,
    regenerated: 0,
    unchanged: 0,
    failed: 0,
    errors: [],
    usage: { input: 0, output: 0 },
    costUsd: 0,
  };
  stats.unchanged = stats.members - jobs.length;

  const rows = [];
  for (const j of jobs) {
    const res = responses.get(j.member.id);
    if (!res || res instanceof Error) {
      stats.failed++;
      stats.errors.push(res?.message ?? "no response");
      continue;
    }
    stats.usage.input += res.usage.input_tokens;
    stats.usage.output += res.usage.output_tokens;
    const parsed = parseSummaryResponse(res, names);
    if (!parsed.ok) {
      stats.failed++;
      stats.errors.push(parsed.error);
      continue;
    }
    rows.push({
      member_id: j.member.id,
      project: j.project,
      summary: parsed.summary,
      source_message_ids: j.source.map((u) => u.id),
      update_count: j.source.length,
      last_post_at: j.source.at(-1)!.createdAt,
      model: res.model,
      generated_at: new Date().toISOString(),
    });
  }
  if (rows.length) {
    // Only generated columns: an admin's override is left as it is.
    const { error } = await db
      .from("member_summaries")
      .upsert(rows, { onConflict: "member_id" });
    if (error) throw error;
  }
  stats.regenerated = rows.length;
  stats.errors = [...new Set(stats.errors)];
  stats.costUsd = Number(usageCostUsd(stats.usage).toFixed(6));
  return stats;
}
