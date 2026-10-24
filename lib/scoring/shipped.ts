// "Shipped" needs a human yes: the classifier flags shipped_candidate, and an
// exec member decides in the review queue (shipped_approvals). Until then the
// message counts as a progress update at its scored substance. Approved
// shipped posts count once per member per project (PLAN.md §5).
import { projectKey, resolveProject, type AliasMap } from "./projects";

export type ApprovalStatus = "pending" | "shipped" | "progress";

/** The category scoring uses, after applying the exec decision (if any). */
export function effectiveCategory(
  category: string,
  approval: ApprovalStatus | null,
): string {
  if (approval === "shipped") return "shipped";
  if (category === "shipped_candidate") return "progress_update";
  return category;
}

export type ShippedCandidate = {
  member_id: string;
  category: string; // effective category
  project: string | null;
  created_at: string;
};

/**
 * The shipped posts that count: the earliest one per member per project, with
 * project names resolved through admin aliases. Posts with no project share one
 * key, so a member's unnamed launches count once.
 */
export function countableShipped<T extends ShippedCandidate>(
  rows: T[],
  aliases: AliasMap = new Map(),
): T[] {
  return [...firstShippedByProject(rows, aliases).values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}

const shipKey = (row: ShippedCandidate, aliases: AliasMap) =>
  `${row.member_id}::${projectKey(resolveProject(row.member_id, row.project, aliases))}`;

function firstShippedByProject<T extends ShippedCandidate>(
  rows: T[],
  aliases: AliasMap,
): Map<string, T> {
  const firsts = new Map<string, T>();
  for (const row of rows) {
    if (row.category !== "shipped") continue;
    const key = shipKey(row, aliases);
    const current = firsts.get(key);
    if (!current || row.created_at < current.created_at) firsts.set(key, row);
  }
  return firsts;
}

/**
 * For each shipped post (by id): null if it is the one earning its project's
 * points, otherwise the earlier post that does. Same rule as
 * countableShipped(), so the profile shows what scoring actually awards.
 */
export function shippedCreditedTo<T extends ShippedCandidate & { id: string }>(
  rows: T[],
  aliases: AliasMap = new Map(),
): Map<string, T | null> {
  const firsts = firstShippedByProject(rows, aliases);
  const out = new Map<string, T | null>();
  for (const row of rows) {
    if (row.category !== "shipped") continue;
    const first = firsts.get(shipKey(row, aliases))!;
    out.set(row.id, first.id === row.id ? null : first);
  }
  return out;
}
