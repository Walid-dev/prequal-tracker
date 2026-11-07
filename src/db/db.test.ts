// Tests for the database setup: migrations, foreign keys, and the health check.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { createTestDb, runMigrations } from "./migrate";
import { requests } from "./schema";

describe("database", () => {
  it("creates the five tables from the migrations", () => {
    const db = createTestDb();
    const rows = db.all<{ name: string }>(
      sql`select name from sqlite_master where type = 'table' order by name`,
    );
    // Leave out SQLite's own table and Drizzle's migration log.
    const ours = rows
      .map((r) => r.name)
      .filter((name) => !name.startsWith("sqlite_") && !name.startsWith("__"));
    expect(ours).toEqual([
      "cases",
      "requests",
      "responses",
      "reviews",
      "triage_runs",
    ]);
  });

  it("is safe to migrate twice", () => {
    const db = createTestDb();
    expect(() => runMigrations(db)).not.toThrow();
  });

  it("refuses a request that points at a case that does not exist", () => {
    const db = createTestDb();
    expect(() =>
      db
        .insert(requests)
        .values({
          caseId: 999,
          kind: "wsib_clearance",
          title: "WSIB",
          instructions: "Send it.",
        })
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it("health check answers ok when the database responds", async () => {
    process.env.DATABASE_PATH = ":memory:";
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
