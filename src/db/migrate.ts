// Applies the SQL migrations in /drizzle to a database, in order. Safe to run on every start.
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { type Db, openDb } from "./client";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Brings a database's tables up to date with the committed migrations. */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

/** Returns a fresh in-memory database with every migration applied. Used by tests. */
export function createTestDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db);
  return db;
}
