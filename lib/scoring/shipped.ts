// "Shipped" posts count once per member per project (PLAN.md §5). Re-announcing
// the same launch, or posting another demo of it, earns nothing extra.

export type ShippedCandidate = {
  member_id: string;
  category: string;
  project: string | null;
  created_at: string;
};

/**
 * Normalizes a project name so spelling variants match:
 * "C-art-ion", "Cartion" and "cartion " all become "cartion".
 * Posts with no project share one key, so a member's unnamed launches count once.
 */
export function projectKey(project: string | null): string {
  const key = (project ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return key || "(unnamed)";
}

/** The shipped posts that count: the earliest one per member per project. */
export function countableShipped<T extends ShippedCandidate>(rows: T[]): T[] {
  const firsts = new Map<string, T>();
  for (const row of rows) {
    if (row.category !== "shipped") continue;
    const key = `${row.member_id}::${projectKey(row.project)}`;
    const current = firsts.get(key);
    if (!current || row.created_at < current.created_at) firsts.set(key, row);
  }
  return [...firsts.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}
