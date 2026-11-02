import { describe, expect, it } from "vitest";
import {
  PRODUCTION_PROJECT_REF,
  assertTestProject,
  projectRef,
} from "./db-target";

const TEST = "abcdefghijklmnopqrst";
const env = (o: Record<string, string | undefined> = {}) => ({
  NEXT_PUBLIC_SUPABASE_URL: `https://${TEST}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  ...o,
});

describe("projectRef", () => {
  it("reads the ref from a Supabase URL", () => {
    expect(projectRef(`https://${TEST}.supabase.co`)).toBe(TEST);
    expect(projectRef(`https://${TEST}.supabase.co/`)).toBe(TEST);
    expect(projectRef("http://127.0.0.1:54321")).toBeNull();
    expect(projectRef("not a url")).toBeNull();
    expect(projectRef(undefined)).toBeNull();
  });
});

describe("assertTestProject", () => {
  it("allows a non-production project", () => {
    expect(assertTestProject(env())).toBe(TEST);
    expect(
      assertTestProject(
        env({
          SUPABASE_TEST_DB_URL: `postgresql://postgres.${TEST}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
        }),
        { needsDbUrl: true },
      ),
    ).toBe(TEST);
  });

  it("refuses production, whatever the spelling", () => {
    for (const url of [
      `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
      `https://${PRODUCTION_PROJECT_REF}.supabase.co/`,
      `HTTPS://${PRODUCTION_PROJECT_REF.toUpperCase()}.SUPABASE.CO`,
    ])
      expect(() =>
        assertTestProject(env({ NEXT_PUBLIC_SUPABASE_URL: url })),
      ).toThrow(/production/);
  });

  it("refuses a production database URL even with a test API URL", () => {
    expect(() =>
      assertTestProject(
        env({
          SUPABASE_TEST_DB_URL: `postgresql://postgres:pw@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
        }),
      ),
    ).toThrow(/production database/);
  });

  it("refuses a URL with a path (e.g. the REST endpoint)", () => {
    expect(() =>
      assertTestProject(
        env({
          NEXT_PUBLIC_SUPABASE_URL: `https://${TEST}.supabase.co/rest/v1/`,
        }),
      ),
    ).toThrow(/no \/rest\/v1/);
  });

  it("refuses missing or mismatched settings", () => {
    expect(() =>
      assertTestProject(env({ NEXT_PUBLIC_SUPABASE_URL: undefined })),
    ).toThrow();
    expect(() =>
      assertTestProject(env({ SUPABASE_SECRET_KEY: undefined })),
    ).toThrow();
    expect(() => assertTestProject(env(), { needsDbUrl: true })).toThrow(
      /SUPABASE_TEST_DB_URL/,
    );
    expect(() =>
      assertTestProject(
        env({
          SUPABASE_TEST_DB_URL:
            "postgresql://postgres:pw@db.zzzzzzzzzzzzzzzzzzzz.supabase.co:5432/postgres",
        }),
      ),
    ).toThrow(/different project/);
  });
});
