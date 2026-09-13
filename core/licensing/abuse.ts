// Abuse protection persistence — failed access-code attempts (brute-force
// resistance). Mirrors the dual-backend pattern in licensing/db.ts:
//   - SQLite (default) for local dev / the downloadable app's own gateway
//   - Postgres/Neon (DATABASE_URL set) for the Vercel production gateway
//
// A failure is one (ip, presented-code) pair rejected by validation. Once an
// IP records ABUSE_THRESHOLD failures inside the window, every guarded route
// denies it until the window expires — regardless of which code it presents.
// This makes online guessing of codes expensive even though codes are only
// 16 chars: 60 bits of entropy + HMAC checksum + rate-limited verification.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { pgQuery } from "../pg";

export const ABUSE_WINDOW_MS = 15 * 60_000; // 15 minutes
export const ABUSE_THRESHOLD = 10; // failures per window before lockout

export interface FailureRecordResult {
  locked: boolean; // true if this failure pushed the IP over the threshold
  failures: number; // failures recorded in the current window
}

const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS tt_auth_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  presented TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tt_auth_failures_ip_ts ON tt_auth_failures(ip, ts);
CREATE INDEX IF NOT EXISTS idx_tt_auth_failures_ts ON tt_auth_failures(ts);
`;

// Postgres: same shape; BIGINT read back as strings, so Number() everywhere.
const SCHEMA_PG = `
CREATE TABLE IF NOT EXISTS tt_auth_failures (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  presented TEXT NOT NULL,
  ts BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tt_auth_failures_ip_ts ON tt_auth_failures(ip, ts);
CREATE INDEX IF NOT EXISTS idx_tt_auth_failures_ts ON tt_auth_failures(ts);
`;

let pgSchemaReady: Promise<void> | null = null;
function ensurePgSchema(): Promise<void> {
  pgSchemaReady ??= pgQuery(SCHEMA_PG).then(() => undefined);
  return pgSchemaReady;
}

let cachedSqlite: Database.Database | null = null;

function sqliteDb(): Database.Database {
  if (cachedSqlite) return cachedSqlite;
  const file = process.env.SQLITE_PATH?.trim() || "data/truffletrade.sqlite3";
  // Same scoping rule as licensing/db.ts: relative paths go under data/ so
  // Turbopack does not trace the whole project on Vercel.
  const resolved = path.isAbsolute(file) ? file : path.join(process.cwd(), "data", path.basename(file));
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(resolved);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQLITE);
  cachedSqlite = db;
  return db;
}

export function dbKindAbuse(): "sqlite" | "postgres" {
  return process.env.DATABASE_URL?.trim() ? "postgres" : "sqlite";
}

/** Count recent failures for an IP inside the abuse window. */
export async function failureCount(ip: string): Promise<number> {
  const since = Date.now() - ABUSE_WINDOW_MS;
  if (dbKindAbuse() === "postgres") {
    await ensurePgSchema();
    const rows = await pgQuery(`SELECT COUNT(*)::int AS n FROM tt_auth_failures WHERE ip = $1 AND ts > $2`, [ip, since]);
    return Number(rows[0]?.n ?? 0);
  }
  const row = sqliteDb()
    .prepare(`SELECT COUNT(*) AS n FROM tt_auth_failures WHERE ip = ? AND ts > ?`)
    .get(ip, since) as { n: number };
  return Number(row.n);
}

/**
 * Record a failed attempt. Returns whether the IP has now crossed the
 * lockout threshold (callers should deny everything from it).
 */
export async function recordFailure(ip: string, presented: string): Promise<FailureRecordResult> {
  const code = presented.slice(0, 60); // never store more than a fragment
  const now = Date.now();
  if (dbKindAbuse() === "postgres") {
    await ensurePgSchema();
    await pgQuery(`INSERT INTO tt_auth_failures (ip, presented, ts) VALUES ($1, $2, $3)`, [ip, code, now]);
  } else {
    sqliteDb()
      .prepare(`INSERT INTO tt_auth_failures (ip, presented, ts) VALUES (?, ?, ?)`)
      .run(ip, code, now);
  }
  const failures = await failureCount(ip);
  return { locked: failures >= ABUSE_THRESHOLD, failures };
}

/** True while an IP is locked out (>= ABUSE_THRESHOLD recent failures). */
export async function isLockedOut(ip: string): Promise<boolean> {
  return (await failureCount(ip)) >= ABUSE_THRESHOLD;
}

/** Best-effort cleanup of expired rows — called opportunistically. */
export async function pruneFailures(): Promise<void> {
  const cutoff = Date.now() - ABUSE_WINDOW_MS;
  try {
    if (dbKindAbuse() === "postgres") {
      await ensurePgSchema();
      await pgQuery(`DELETE FROM tt_auth_failures WHERE ts < $1`, [cutoff]);
    } else {
      sqliteDb().prepare(`DELETE FROM tt_auth_failures WHERE ts < ?`).run(cutoff);
    }
  } catch {
    // cleanup is opportunistic; never block a request on it
  }
}

/** Test/operator helper: clear all failure records. */
export async function clearFailures(): Promise<void> {
  if (dbKindAbuse() === "postgres") {
    await ensurePgSchema();
    await pgQuery(`DELETE FROM tt_auth_failures`);
  } else {
    sqliteDb().prepare(`DELETE FROM tt_auth_failures`).run();
  }
}
