import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/** Open a database file (or ":memory:") and bring it up to the latest schema. */
export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

export function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

// Reuse one connection per process (survives Next dev hot reloads).
const globalForDb = globalThis as unknown as { __assassinsDb?: DB };

export function getDb(): DB {
  if (!globalForDb.__assassinsDb) {
    globalForDb.__assassinsDb = openDb(path.join(dataDir(), "assassins.db"));
  }
  return globalForDb.__assassinsDb;
}
