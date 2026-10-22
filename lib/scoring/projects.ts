// Project names: normalization, admin-defined aliases, and each member's known
// projects (passed to the classifier so names stay consistent over time).

/**
 * Normalizes a project name so spelling variants match:
 * "C-art-ion", "Cartion" and "cartion " all become "cartion".
 * An empty name maps to "(unnamed)".
 */
export function projectKey(project: string | null): string {
  const key = (project ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return key || "(unnamed)";
}

export type ProjectAlias = {
  member_id: string;
  alias: string;
  canonical: string;
};

/** member_id + normalized alias → canonical name. */
export type AliasMap = ReadonlyMap<string, string>;

export function buildAliasMap(aliases: ProjectAlias[]): AliasMap {
  return new Map(
    aliases.map((a) => [`${a.member_id}::${projectKey(a.alias)}`, a.canonical]),
  );
}

/** The canonical name for a member's project (itself if no alias applies). */
export function resolveProject(
  memberId: string,
  project: string | null,
  aliases: AliasMap,
): string | null {
  if (!project) return null;
  return aliases.get(`${memberId}::${projectKey(project)}`) ?? project;
}

/**
 * A member's known projects, grown chronologically. `before(memberId, at)`
 * returns distinct canonical names from messages earlier than `at`, so the
 * classifier only ever sees projects that already existed.
 */
export class KnownProjects {
  private byMember = new Map<string, { name: string; at: string }[]>();

  constructor(private aliases: AliasMap) {}

  add(memberId: string, project: string | null, at: string): void {
    const name = resolveProject(memberId, project, this.aliases);
    if (!name) return;
    const list = this.byMember.get(memberId) ?? [];
    list.push({ name, at });
    this.byMember.set(memberId, list);
  }

  before(memberId: string, at: string): string[] {
    const names = new Map<string, string>(); // key → first-seen spelling
    for (const p of (this.byMember.get(memberId) ?? [])
      .filter((p) => p.at < at)
      .sort((a, b) => a.at.localeCompare(b.at))) {
      if (!names.has(projectKey(p.name))) names.set(projectKey(p.name), p.name);
    }
    return [...names.values()];
  }
}
