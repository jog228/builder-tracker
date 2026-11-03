// The "Add a teammate" combobox: which builders to list for what's typed, and
// what counts as a choice. Pure, so the rules are tested apart from the UI
// (components/profile/teammates.tsx). Options only ever come from
// teammate_candidates(); the server action re-checks the chosen id anyway.
import type { TeammateMember } from "./rules";

/** Lowercased, accents removed ("Zoë Núñez" → "zoe nunez"). */
export const foldName = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Case- and accent-insensitive match anywhere in the name. Blank matches all. */
export function matchesBuilder(name: string, query: string): boolean {
  const q = foldName(query.trim());
  return !q || foldName(name).includes(q);
}

/**
 * What the list shows. While the input still shows the chosen builder's name
 * (just picked, or reopened), it lists everyone, so it can be changed
 * without clearing the text first.
 */
export function filterBuilders(
  candidates: TeammateMember[],
  query: string,
  selected: TeammateMember | null,
): TeammateMember[] {
  if (selected && query === selected.name) return candidates;
  return candidates.filter((c) => matchesBuilder(c.name, query));
}

/** Typing after choosing someone drops the choice until a new one is picked. */
export function choiceAfterTyping(
  selected: TeammateMember | null,
  typed: string,
): TeammateMember | null {
  return selected && typed === selected.name ? selected : null;
}

/**
 * The builder Add would send, or null: only an actual roster option, never
 * free text or a stale pick that's no longer offered.
 */
export function pickedBuilder(
  candidates: TeammateMember[],
  selected: TeammateMember | null,
): TeammateMember | null {
  return selected
    ? (candidates.find((c) => c.id === selected.id) ?? null)
    : null;
}
