// Append-only audit trail (spec §48). Same dual-backend convention as
// core/licensing/db.ts: SQLite locally, Postgres (Neon) on Vercel. Schema is
// created idempotently at first use. Actor identifiers are always hashes —
// never raw access codes, emails, or payment details.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { dbKind } from "./licensing/db";

export interface AuditEventRow {
  id: number;
  ts: number;
  actorHash: string; // code hash, or "system" / "admin" — never raw identifiers
  event: string;
  detailJson: string;
}

export interface AuditStore {
  kind: "sqlite" | "postgres";
  audit(event: string, actorHash: string, detail: Record<string, unknown>): Awaitable<void>;
  recentAudit(limit: number): Awaitable<AuditEventRow[]>;
}

type Awaitable<T> = T | Promise<T>;

const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS tt_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  actor_hash TEXT NOT NULL,
  event TEXT NOT NULL,
  detail_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tt_audit_ts ON tt_audit_events(ts DESC);
`;

const SCHEMA_PG = `
CREATE TABLE IF NOT EXISTS tt_audit_events (
  id BIGSERIAL PRIMARY KEY,
  ts BIGINT NOT NULL,
  actor_hash TEXT NOT NULL,
  event TEXT NOT NULL,
  detail_json JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tt_audit_ts ON tt_audit_events(ts DESC);
`;

type PgClient = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

/** JSONB columns arrive as strings (SQLite) or parsed objects (pg) — normalize. */
function jsonbText(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v ?? {});
}

declare global {
  // eslint-disable-next-line no-var
  var __ttAuditPg: PgClient | null | undefined;
  // eslint-disable-next-line no-var
  var __ttAuditSqlite: Database.Database | undefined;
}

function sqliteHandle(): Database.Database {
  if (globalThis.__ttAuditSqlite) return globalThis.__ttAuditSqlite;
  const file = process.env.SQLITE_PATH?.trim() || "data/truffletrade.sqlite3";
  // Statically scope relative paths under data/ so Turbopack does not trace the
  // whole project on Vercel (build failure otherwise). Absolute paths (tests)
  // pass through unchanged. SQLite is only used off-Vercel.
  const resolved = path.isAbsolute(file) ? file : path.join(process.cwd(), "data", path.basename(file));
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(resolved);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQLITE);
  globalThis.__ttAuditSqlite = db;
  return db;
}

function rowToEvent(r: Record<string, unknown>): AuditEventRow {
  return {
    id: Number(r.id),
    ts: Number(r.ts),
    actorHash: String(r.actor_hash),
    event: String(r.event),
    detailJson: jsonbText(r.detail_json),
  };
}

class SqliteAuditStore implements AuditStore {
  readonly kind = "sqlite" as const;

  audit(event: string, actorHash: string, detail: Record<string, unknown>): void {
    sqliteHandle()
      .prepare(`INSERT INTO tt_audit_events (ts, actor_hash, event, detail_json) VALUES (?, ?, ?, ?)`)
      .run(Date.now(), actorHash, event, JSON.stringify(detail));
  }

  recentAudit(limit: number): AuditEventRow[] {
    return (
      sqliteHandle()
        .prepare(`SELECT * FROM tt_audit_events ORDER BY ts DESC, id DESC LIMIT ?`)
        .all(limit) as Record<string, unknown>[]
    ).map(rowToEvent);
  }
}

class PostgresAuditStore implements AuditStore {
  readonly kind = "postgres" as const;

  private async q(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const g = globalThis as unknown as { __ttAuditPg?: PgClient | null };
    if (!g.__ttAuditPg) {
      const url = process.env.DATABASE_URL?.trim();
      if (!url) throw new Error("DATABASE_URL is required for the Postgres audit backend.");
      const { Client } = await import("pg");
      const client = new Client({ connectionString: url });
      await client.connect();
      await client.query(SCHEMA_PG);
      g.__ttAuditPg = client as unknown as PgClient;
    }
    return (await g.__ttAuditPg.query(sql, params)).rows;
  }

  async audit(event: string, actorHash: string, detail: Record<string, unknown>): Promise<void> {
    await this.q(`INSERT INTO tt_audit_events (ts, actor_hash, event, detail_json) VALUES ($1, $2, $3, $4)`, [
      Date.now(),
      actorHash,
      event,
      JSON.stringify(detail),
    ]);
  }

  async recentAudit(limit: number): Promise<AuditEventRow[]> {
    const rows = await this.q(`SELECT * FROM tt_audit_events ORDER BY ts DESC, id DESC LIMIT $1`, [limit]);
    return rows.map(rowToEvent);
  }
}

export function auditStore(): AuditStore {
  return dbKind() === "postgres" ? new PostgresAuditStore() : new SqliteAuditStore();
}

/** Fire-and-forget audit write: logging must never break the caller's flow. */
export function auditEvent(event: string, actorHash: string, detail: Record<string, unknown> = {}): void {
  Promise.resolve(auditStore().audit(event, actorHash, detail)).catch(() => {
    // Swallow: an audit write failure must not fail a payment/admin action.
  });
}
