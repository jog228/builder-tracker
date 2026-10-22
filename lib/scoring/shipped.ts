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
  const firsts = new Map<string, T>();
  for (const row of rows) {
    if (row.category !== "shipped") continue;
    const name = resolveProject(row.member_id, row.project, aliases);
    const key = `${row.member_id}::${projectKey(name)}`;
    const current = firsts.get(key);
    if (!current || row.created_at < current.created_at) firsts.set(key, row);
  }
  return [...firsts.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}
