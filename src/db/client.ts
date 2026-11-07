// Opens the SQLite database and shares one connection. It opens on first use, so `next build` never touches the file.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  type BetterSQLite3Database,
  drizzle,
} from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

let shared: Db | undefined;

/** Returns the app's shared database connection, opening the file on first use. */
export function getDb(): Db {
  if (!shared) shared = openDb(process.env.DATABASE_PATH ?? "./data/app.db");
  return shared;
}

/** Opens a database at a file path, or ":memory:" for tests. Creates the folder if needed. */
export function openDb(file: string): Db {
  if (file !== ":memory:")
    fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}
