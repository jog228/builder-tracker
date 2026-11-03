import { describe, expect, it } from "vitest";
import {
  choiceAfterTyping,
  filterBuilders,
  foldName,
  matchesBuilder,
  pickedBuilder,
} from "./picker";
import type { TeammateMember } from "./rules";

const m = (id: string, name: string): TeammateMember => ({
  id,
  name,
  avatarUrl: null,
});
const ava = m("1", "Ava Decker");
const zoe = m("2", "Zoë Núñez");
const ben = m("3", "Ben Ruiz");
const roster = [ava, zoe, ben];
const names = (list: TeammateMember[]) => list.map((c) => c.name);

describe("matchesBuilder", () => {
  it("ignores case and matches anywhere in the name", () => {
    expect(matchesBuilder("Ava Decker", "ava")).toBe(true);
    expect(matchesBuilder("Ava Decker", "DECK")).toBe(true);
    expect(matchesBuilder("Ava Decker", "a d")).toBe(true);
    expect(matchesBuilder("Ava Decker", "ben")).toBe(false);
  });

  it("ignores accents on either side", () => {
    expect(foldName("Zoë Núñez")).toBe("zoe nunez");
    expect(matchesBuilder("Zoë Núñez", "zoe")).toBe(true);
    expect(matchesBuilder("Zoë Núñez", "nunez")).toBe(true);
    expect(matchesBuilder("Zoe Nunez", "Zoë")).toBe(true);
    // Decomposed input (e + combining diaeresis) too.
    expect(matchesBuilder("Zoë", "zoë")).toBe(true);
  });

  it("treats blank input as matching everyone", () => {
    expect(matchesBuilder("Ava Decker", "")).toBe(true);
    expect(matchesBuilder("Ava Decker", "   ")).toBe(true);
  });
});

describe("filterBuilders", () => {
  it("lists everyone for empty input, matches otherwise, none for no match", () => {
    expect(names(filterBuilders(roster, "", null))).toEqual(names(roster));
    expect(names(filterBuilders(roster, "nu", null))).toEqual(["Zoë Núñez"]);
    expect(filterBuilders(roster, "xyz", null)).toEqual([]);
  });

  it("lists everyone while the input still shows the chosen name", () => {
    expect(filterBuilders(roster, "Ava Decker", ava)).toEqual(roster);
    // Once they edit it, it filters again.
    expect(names(filterBuilders(roster, "Ava Decke", ava))).toEqual([
      "Ava Decker",
    ]);
  });

  it("only ever returns roster options", () => {
    expect(filterBuilders([], "Ava", null)).toEqual([]);
  });
});

describe("choiceAfterTyping", () => {
  it("keeps the choice only while the text is exactly its name", () => {
    expect(choiceAfterTyping(ava, "Ava Decker")).toBe(ava);
    expect(choiceAfterTyping(ava, "Ava Decker ")).toBeNull();
    expect(choiceAfterTyping(ava, "Ava")).toBeNull();
    expect(choiceAfterTyping(ava, "")).toBeNull();
    expect(choiceAfterTyping(null, "Ava Decker")).toBeNull();
  });
});

describe("pickedBuilder", () => {
  it("is the chosen roster member", () => {
    expect(pickedBuilder(roster, zoe)).toBe(zoe);
  });

  it("is null for no choice, free text, or someone no longer offered", () => {
    expect(pickedBuilder(roster, null)).toBeNull();
    // Typed text never becomes a member: there is no choice to send.
    expect(
      pickedBuilder(roster, choiceAfterTyping(null, "Ava Decker")),
    ).toBeNull();
    // An object that looks like a member but isn't in the options.
    expect(pickedBuilder(roster, m("9", "Ava Decker"))).toBeNull();
    // A pick that dropped out of the list (e.g. after a refresh).
    expect(pickedBuilder([ava, ben], zoe)).toBeNull();
  });
});
