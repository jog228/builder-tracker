import { describe, expect, it } from "vitest";
import {
  isCloseName,
  levenshtein,
  matchRoster,
  nameKey,
  needsLehighWarning,
  parseCsv,
  readRoster,
  type RosterMember,
  type RosterRow,
} from "./roster";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, BOM and blank lines", () => {
    expect(
      parseCsv(
        '﻿name,email\r\n"Kim, Michael",mk@lehigh.edu\r\n\r\n"A ""B""",x\n',
      ),
    ).toEqual([
      ["name", "email"],
      ["Kim, Michael", "mk@lehigh.edu"],
      ['A "B"', "x"],
    ]);
  });
});

describe("readRoster", () => {
  it("reads name, email and groupme_name_hint", () => {
    expect(
      readRoster(
        "name,email,groupme_name_hint\nMichael Kim, MK@Lehigh.edu ,Mike K\nReid Sanders,rs@lehigh.edu,\n",
      ),
    ).toEqual([
      {
        line: 2,
        name: "Michael Kim",
        hint: "Mike K",
        email: "mk@lehigh.edu",
        groupmeId: null,
      },
      {
        line: 3,
        name: "Reid Sanders",
        hint: null,
        email: "rs@lehigh.edu",
        groupmeId: null,
      },
    ]);
  });
  it("prefers a Lehigh email column", () => {
    expect(
      readRoster(
        "Name,Personal Email,Lehigh Email\nX,x@gmail.com,x@lehigh.edu",
      )[0].email,
    ).toBe("x@lehigh.edu");
  });
  it("combines first and last names when there's no name column", () => {
    expect(
      readRoster("First,Last,Email\nReid,Sanders,rs@lehigh.edu")[0].name,
    ).toBe("Reid Sanders");
  });
  it("reads an optional GroupMe id column", () => {
    expect(
      readRoster("Name,Email,GroupMe ID\nX,x@lehigh.edu,123")[0].groupmeId,
    ).toBe("123");
  });
  it("explains a missing column", () => {
    expect(() => readRoster("Name,Phone\nX,1")).toThrow(/email column/);
  });
});

describe("names", () => {
  it("nameKey ignores case, accents, punctuation and spacing", () => {
    expect(nameKey("  José  O'Neil-Smith ")).toBe(nameKey("jose o neil smith"));
  });
  it("levenshtein counts edits", () => {
    expect(levenshtein("paudel", "poudel")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
  });
  it("isCloseName accepts typos, first-name-only and last initials", () => {
    expect(isCloseName("Darshan Poudel", "Darshan Paudel")).toBe("spelling");
    expect(isCloseName("Henry Hasty", "Henry")).toBe("first name only");
    expect(isCloseName("Shenouda N.", "Shenouda Nessim")).toBe("last initial");
  });
  it("isCloseName rejects different people", () => {
    expect(isCloseName("Josh Boswell", "Josh Smith")).toBe(false);
    expect(isCloseName("Mike Kim", "Michael Kim")).toBe(false);
    expect(isCloseName("Ava Decker", "Ava Decker")).toBe(false); // exact, not close
    expect(isCloseName("Amy", "Ami")).toBe(false); // too short for a typo
  });
});

describe("matchRoster", () => {
  const m = (
    id: string,
    name: string,
    extra: Partial<RosterMember> = {},
  ): RosterMember => ({
    id,
    name,
    email: null,
    groupmeId: null,
    active: true,
    ...extra,
  });
  const row = (
    line: number,
    name: string,
    email: string,
    hint: string | null = null,
    groupmeId: string | null = null,
  ): RosterRow => ({ line, name, email, hint, groupmeId });

  const members = [
    m("1", "Michael Kim"),
    m("2", "Reid Sanders", { email: "rs@lehigh.edu" }),
    m("3", "Henry Hasty", { email: "old@lehigh.edu" }),
    m("4", "Josh"),
    m("5", "Josh"),
    m("6", "Luke Szura", { groupmeId: "999" }),
    m("7", "Darshan Paudel"),
    m("8", "Shenouda Nessim"),
    m("9", "Avneet Kaur"),
  ];

  it("classifies every row", () => {
    const res = matchRoster(
      [
        row(2, "michael  kim", "mk@lehigh.edu"),
        row(3, "Reid Sanders", "rs@lehigh.edu"),
        row(4, "Henry Hasty", "hh@lehigh.edu"),
        row(5, "Josh Boswell", "j@lehigh.edu", "Josh"),
        row(6, "Nobody Here", "nb@lehigh.edu"),
        row(7, "Someone", "not-an-email"),
        row(8, "Other Person", "mk@lehigh.edu"),
        row(9, "L. Szura", "ls@lehigh.edu", null, "999"),
        row(10, "Michael Kim", "mk2@lehigh.edu"),
      ],
      members,
    );
    expect(res.map((r) => r.status)).toEqual([
      "set",
      "unchanged",
      "conflict",
      "ambiguous",
      "unmatched",
      "invalid-email",
      "duplicate",
      "set",
      "duplicate",
    ]);
  });

  it("uses the hint instead of the name when it's set", () => {
    const [r] = matchRoster(
      [row(2, "Avneet K.", "ak@lehigh.edu", "Avneet Kaur")],
      members,
    );
    expect(r).toMatchObject({ status: "set", via: "hint", close: null });
  });

  it("doesn't fall back to the name when the hint finds nobody", () => {
    const [r] = matchRoster(
      [row(2, "Avneet Kaur", "ak@lehigh.edu", "Totally Different")],
      members,
    );
    expect(r).toMatchObject({ status: "unmatched", via: "hint" });
  });

  it("accepts one close match and says why", () => {
    const res = matchRoster(
      [
        row(2, "Darshan Poudel", "dp@lehigh.edu"),
        row(3, "Shenouda N.", "sn@lehigh.edu"),
      ],
      members,
    );
    expect(res).toMatchObject([
      { status: "set", close: "spelling", member: { id: "7" } },
      { status: "set", close: "last initial", member: { id: "8" } },
    ]);
  });

  it("reports several close matches as ambiguous", () => {
    const [r] = matchRoster([row(2, "Josh Boswell", "jb@lehigh.edu")], members);
    expect(r.status === "ambiguous" && r.candidates.map((c) => c.id)).toEqual([
      "4",
      "5",
    ]);
  });

  it("doesn't offer a member someone else matched exactly as a close match", () => {
    const res = matchRoster(
      [
        row(2, "Avneet Kaur", "ak@lehigh.edu"),
        row(3, "Avneet Kaurr", "ak2@lehigh.edu"),
      ],
      members,
    );
    expect(res.map((r) => r.status)).toEqual(["set", "unmatched"]);
  });

  it("won't give one member's email to another", () => {
    const [r] = matchRoster([row(2, "Michael Kim", "rs@lehigh.edu")], members);
    expect(r).toMatchObject({ status: "duplicate" });
  });

  it("suggests members sharing a name word", () => {
    const [r] = matchRoster([row(2, "Mike Kim", "mk@lehigh.edu")], members);
    expect(
      r.status === "unmatched" && r.suggestions.map((s) => s.name),
    ).toEqual(["Michael Kim"]);
  });

  it("flags non-Lehigh emails that would be written", () => {
    const [r] = matchRoster([row(2, "Michael Kim", "mk@gmail.com")], members);
    expect(needsLehighWarning(r)).toBe(true);
  });
});
