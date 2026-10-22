import { describe, expect, it } from "vitest";
import {
  matchRoster,
  nameKey,
  needsLehighWarning,
  parseCsv,
  readRoster,
  type RosterMember,
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
  it("prefers a GroupMe name column and a Lehigh email column", () => {
    const rows = readRoster(
      "Full Name,GroupMe Name,Personal Email,Lehigh Email\nMichael Kim,Mike K,m@gmail.com, MK@Lehigh.edu \n",
    );
    expect(rows).toEqual([
      { line: 2, name: "Mike K", email: "mk@lehigh.edu", groupmeId: null },
    ]);
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

describe("nameKey", () => {
  it("ignores case, accents, punctuation and spacing", () => {
    expect(nameKey("  José  O'Neil-Smith ")).toBe(nameKey("jose o neil smith"));
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
  const members = [
    m("1", "Michael Kim"),
    m("2", "Reid Sanders", { email: "rs@lehigh.edu" }),
    m("3", "Henry Hasty", { email: "old@lehigh.edu" }),
    m("4", "Josh"),
    m("5", "Josh"),
    m("6", "Luke Szura", { groupmeId: "999" }),
  ];
  const row = (
    line: number,
    name: string,
    email: string,
    groupmeId = null as string | null,
  ) => ({
    line,
    name,
    email,
    groupmeId,
  });

  it("classifies every row", () => {
    const res = matchRoster(
      [
        row(2, "michael  kim", "mk@lehigh.edu"),
        row(3, "Reid Sanders", "rs@lehigh.edu"),
        row(4, "Henry Hasty", "hh@lehigh.edu"),
        row(5, "Josh", "j@lehigh.edu"),
        row(6, "Mike Kimball", "mkb@lehigh.edu"),
        row(7, "Someone", "not-an-email"),
        row(8, "Other Person", "mk@lehigh.edu"),
        row(9, "L. Szura", "ls@lehigh.edu", "999"),
        row(10, "Michael Kim", "mk2@lehigh.edu"),
        row(11, "Nobody", "rs2@lehigh.edu"),
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
      "unmatched",
    ]);
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
