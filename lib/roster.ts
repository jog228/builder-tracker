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
  email: string;
  groupmeId: string | null;
};

/**
 * Finds the name / email (and optional GroupMe id) columns by header.
 * Prefers a "GroupMe name" column; falls back to "name", or first + last.
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
  const groupmeId = find((s) => /groupme.*(id|user)/.test(s));
  const name = find(
    (s) => s.includes("groupme") && s.includes("name"),
    (s) => s === "name" || s === "full name" || s === "display name",
    (s) => s.includes("name") && !/first|last|user/.test(s),
  );
  const first = find((s) => s.includes("first"));
  const last = find((s) => s.includes("last"));
  if (email < 0)
    throw new Error(`No email column in the header: ${header.join(", ")}`);
  if (name < 0 && first < 0)
    throw new Error(`No name column in the header: ${header.join(", ")}`);

  return body.map((r, i) => ({
    line: i + 2,
    name:
      name >= 0
        ? (r[name] ?? "").trim()
        : `${r[first] ?? ""} ${last >= 0 ? (r[last] ?? "") : ""}`.trim(),
    email: (r[email] ?? "").trim().toLowerCase(),
    groupmeId: groupmeId >= 0 ? (r[groupmeId] ?? "").trim() || null : null,
  }));
}

/** Case-, accent-, punctuation- and spacing-insensitive name key. */
export const nameKey = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type RosterMember = {
  id: string;
  name: string;
  email: string | null;
  groupmeId: string | null;
  active: boolean;
};

export type RowResult = { row: RosterRow } & (
  | { status: "set"; member: RosterMember } // will write the email
  | { status: "unchanged"; member: RosterMember } // already has it
  | { status: "conflict"; member: RosterMember } // member has another email
  | { status: "unmatched"; suggestions: RosterMember[] }
  | { status: "ambiguous"; candidates: RosterMember[] }
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

  const seenEmail = new Map<string, number>();
  const seenMember = new Map<string, number>();
  return rows.map((row): RowResult => {
    if (!EMAIL.test(row.email)) return { row, status: "invalid-email" };
    if (seenEmail.has(row.email))
      return {
        row,
        status: "duplicate",
        reason: `email already on line ${seenEmail.get(row.email)}`,
      };
    seenEmail.set(row.email, row.line);

    let member: RosterMember | undefined;
    if (row.groupmeId) member = byGroupme.get(row.groupmeId);
    if (!member) {
      const hits = byName.get(nameKey(row.name)) ?? [];
      if (hits.length > 1)
        return { row, status: "ambiguous", candidates: hits };
      member = hits[0];
    }
    if (!member)
      return {
        row,
        status: "unmatched",
        suggestions: suggest(row.name, members),
      };

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
    if (member.email === row.email) return { row, status: "unchanged", member };
    if (member.email) return { row, status: "conflict", member };
    return { row, status: "set", member };
  });
}

/** Roster emails that can't use Google sign-in (admins can still use a link). */
export const needsLehighWarning = (r: RowResult) =>
  (r.status === "set" || r.status === "unchanged") &&
  !isAllowedDomain(r.row.email);
