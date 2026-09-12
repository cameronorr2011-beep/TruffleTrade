// Neutral SQLite handle shared by the research platform, memory system, and
// licensing local mode. Created when the BTC desk was removed (2026-09-11):
// no trading tables, no broker config — just the database.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const file = process.env.SQLITE_PATH?.trim() || "data/truffletrade.sqlite3";
  // Statically scope relative paths under data/ (Turbopack tracing safety).
  const resolved = path.isAbsolute(file) ? file : path.join(process.cwd(), "data", path.basename(file));
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  db = new Database(resolved);
  db.pragma("journal_mode = WAL");
  return db;
}
