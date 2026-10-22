// Matching data/roster.csv (names + emails) to members by GroupMe name. Pure;
// scripts/import-roster.ts loads the data and writes the results.

import { isAllowedDomain } from "@/lib/auth-rules";

/** Minimal RFC 4180 CSV: quoted fields, "" escapes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

export type RosterRow = {
  line: number; // 1-based line in the CSV (header is line 1)
  name: string;
  /** GroupMe display name to match instead of `name`, when the roster has one. */
  hint: string | null;
  email: string;
  groupmeId: string | null;
};

/**
 * Finds the name / email columns (plus optional GroupMe name hint and GroupMe
 * id) by header: "name" (or first + last), "email" (preferring a Lehigh one),
 * a header with "hint" or "groupme … name", and "groupme … id".
 */
export function readRoster(text: string): RosterRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) throw new Error("The roster is empty.");
  const h = header.map((x) => x.trim().toLowerCase());
  const find = (...tests: ((s: string) => boolean)[]) => {
    for (const t of tests) {
      const i = h.findIndex(t);
      if (i >= 0) return i;
    }
    return -1;
  };
  const email = find(
    (s) => s.includes("lehigh") && s.includes("email"),
    (s) => s.includes("email"),
  );
  const groupmeId = find(
    (s) => /groupme.*(id|user)/.test(s) && !s.includes("name"),
  );
  const hint = find(
    (s) => s.includes("hint"),
    (s) => s.includes("groupme") && s.includes("name"),
  );
  const name = find(
    (s) => s === "name" || s === "full name" || s === "display name",
    (s, i = h.indexOf(s)) =>
      s.includes("name") &&
      !/first|last|user|hint|groupme/.test(s) &&
      i !== hint,
  );
  const first = find((s) => s.includes("first"));
  const last = find((s) => s.includes("last"));
  if (email < 0)
    throw new Error(`No email column in the header: ${header.join(", ")}`);
  if (name < 0 && first < 0 && hint < 0)
    throw new Error(`No name column in the header: ${header.join(", ")}`);

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  return body.map((r, i) => ({
    line: i + 2,
    name:
      name >= 0 ? cell(r, name) : `${cell(r, first)} ${cell(r, last)}`.trim(),
    hint: cell(r, hint) || null,
    email: cell(r, email).toLowerCase(),
    groupmeId: cell(r, groupmeId) || null,
  }));
}

/** Case-, accent-, punctuation- and spacing-insensitive name key. */
export const nameKey = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Edit distance (insert/delete/substitute). */
export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = cur;
  }
  return prev[b.length];
}

/**
 * "Close" (not exact) name matches, conservatively:
 * - a typo: edit distance ≤ 1 (≤ 2 for names of 10+ letters), names ≥ 5 letters
 * - same first name, and one side is only a first name ("Henry" ↔ "Henry Hasty")
 * - same first name, and one last name is just its initial ("Shenouda N." ↔
 *   "Shenouda Nessim")
 */
export function isCloseName(a: string, b: string): false | string {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb || ka === kb) return false;
  const shorter = Math.min(ka.length, kb.length);
  if (shorter >= 5 && levenshtein(ka, kb) <= (shorter >= 10 ? 2 : 1))
    return "spelling";
  const ta = ka.split(" ");
  const tb = kb.split(" ");
  if (ta[0] !== tb[0]) return false;
  if (ta.length === 1 || tb.length === 1) return "first name only";
  const la = ta.at(-1)!;
  const lb = tb.at(-1)!;
  if (la[0] === lb[0] && (la.length === 1 || lb.length === 1))
    return "last initial";
  return false;
}

export type RosterMember = {
  id: string;
  name: string;
  email: string | null;
  groupmeId: string | null;
  active: boolean;
};

/** How a row found its member. */
export type MatchInfo = {
  via: "groupme id" | "hint" | "name";
  /** null for an exact match; otherwise why it's close ("spelling", ...). */
  close: string | null;
};

type Matched = { member: RosterMember } & MatchInfo;

export type RowResult = { row: RosterRow } & (
  | ({ status: "set" } & Matched) // will write the email
  | ({ status: "unchanged" } & Matched) // already has it
  | ({ status: "conflict" } & Matched) // member has another email
  | { status: "unmatched"; via: "hint" | "name"; suggestions: RosterMember[] }
  | { status: "ambiguous"; via: "hint" | "name"; candidates: RosterMember[] }
  | { status: "invalid-email" }
  | { status: "duplicate"; reason: string }
);

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Up to 3 members sharing a name word with this row ("did you mean"). */
function suggest(name: string, members: RosterMember[]) {
  const words = new Set(
    nameKey(name)
      .split(" ")
      .filter((w) => w.length > 1),
  );
  return members
    .map((m) => ({
      m,
      score: nameKey(m.name)
        .split(" ")
        .filter((w) => words.has(w)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.m);
}

/**
 * Matches roster rows to members: GroupMe id if given, else the hint if set,
 * else the name. Exact (normalized) matches are claimed first; close matches
 * then only consider members nobody matched exactly, and count only when
 * exactly one member is close.
 */
export function matchRoster(
  rows: RosterRow[],
  members: RosterMember[],
): RowResult[] {
  const byName = new Map<string, RosterMember[]>();
  for (const m of members) {
    const k = nameKey(m.name);
    byName.set(k, [...(byName.get(k) ?? []), m]);
  }
  const byGroupme = new Map(
    members.filter((m) => m.groupmeId).map((m) => [m.groupmeId!, m]),
  );
  const ownerOfEmail = new Map(
    members.filter((m) => m.email).map((m) => [m.email!, m]),
  );

  // Pass 1: everything except close matches.
  type Pending = { row: RosterRow; via: "hint" | "name"; query: string };
  const found = new Map<number, RowResult | Pending>();
  const seenEmail = new Map<string, number>();
  const claimed = new Set<string>();
  for (const row of rows) {
    if (!EMAIL.test(row.email)) {
      found.set(row.line, { row, status: "invalid-email" });
      continue;
    }
    if (seenEmail.has(row.email)) {
      found.set(row.line, {
        row,
        status: "duplicate",
        reason: `email already on line ${seenEmail.get(row.email)}`,
      });
      continue;
    }
    seenEmail.set(row.email, row.line);

    const byId = row.groupmeId ? byGroupme.get(row.groupmeId) : undefined;
    if (byId) {
      found.set(row.line, {
        row,
        status: "set",
        member: byId,
        via: "groupme id",
        close: null,
      });
      claimed.add(byId.id);
      continue;
    }
    const via = row.hint ? "hint" : "name";
    const query = row.hint ?? row.name;
    const hits = byName.get(nameKey(query)) ?? [];
    if (hits.length > 1) {
      found.set(row.line, { row, status: "ambiguous", via, candidates: hits });
    } else if (hits.length === 1) {
      found.set(row.line, {
        row,
        status: "set",
        member: hits[0],
        via,
        close: null,
      });
      claimed.add(hits[0].id);
    } else {
      found.set(row.line, { row, via, query });
    }
  }

  // Pass 2: close matches among unclaimed members.
  const open = members.filter((m) => !claimed.has(m.id));
  for (const [line, f] of found) {
    if ("status" in f) continue;
    const close = open
      .map((m) => ({ m, why: isCloseName(f.query, m.name) }))
      .filter((x): x is { m: RosterMember; why: string } => !!x.why);
    found.set(
      line,
      close.length === 1
        ? {
            row: f.row,
            status: "set",
            member: close[0].m,
            via: f.via,
            close: close[0].why,
          }
        : close.length > 1
          ? {
              row: f.row,
              status: "ambiguous",
              via: f.via,
              candidates: close.map((c) => c.m),
            }
          : {
              row: f.row,
              status: "unmatched",
              via: f.via,
              suggestions: suggest(f.query, members),
            },
    );
  }

  // Pass 3: one member per row, and don't hand out someone else's email.
  const seenMember = new Map<string, number>();
  return rows.map((row): RowResult => {
    const r = found.get(row.line) as RowResult;
    if (r.status !== "set") return r;
    const { member } = r;
    if (seenMember.has(member.id))
      return {
        row,
        status: "duplicate",
        reason: `${member.name} already matched on line ${seenMember.get(member.id)}`,
      };
    seenMember.set(member.id, row.line);
    const owner = ownerOfEmail.get(row.email);
    if (owner && owner.id !== member.id)
      return {
        row,
        status: "duplicate",
        reason: `email already belongs to ${owner.name}`,
      };
    if (member.email === row.email) return { ...r, status: "unchanged" };
    if (member.email) return { ...r, status: "conflict" };
    return r;
  });
}

/** Roster emails that can't use Google sign-in (admins can still use a link). */
export const needsLehighWarning = (r: RowResult) =>
  (r.status === "set" || r.status === "unchanged") &&
  !isAllowedDomain(r.row.email);
