// Licensing + billing + federation persistence. Two backends:
//  - SQLite (default) for local dev / the downloadable app's own gateway usage
//  - Postgres (when DATABASE_URL is set) for the Vercel production gateway
// Same schema and method surface on both — routes never care which is active.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { pgQuery } from "../pg";

export interface OrderRow {
  id: string;
  chargeId: string;
  status: "pending" | "paid" | "issued" | "expired";
  createdTs: number;
  paidTs: number | null;
  codeHash: string | null;
  /** Plaintext access code, stored on the order so the buyer can retrieve it
   *  from the status endpoint after payment. Codes are hashed in tt_codes;
   *  the plaintext lives only here, tied to this one order. */
  codePlain: string | null;
  /** Settlement of the received sats to the operator wallet:
   *  pending -> sent | failed. Null = pre-settlement (legacy) rows. */
  payoutStatus: "pending" | "sent" | "failed" | null;
  payoutRef: string | null; // ZBD payment id when sent
  payoutError: string | null;
  payoutTs: number | null;
}

export interface CodeRow {
  codeHash: string;
  orderId: string;
  status: "active" | "revoked";
  activatedTs: number;
  expiresTs: number;
  lastSeenTs: number | null;
  callsTotal: number;
}

// Methods may be sync (SQLite) or async (Postgres) — call sites always await.
export type Awaitable<T> = T | Promise<T>;

export interface LicensingDb {
  kind: "sqlite" | "postgres";
  createOrder(id: string, chargeId: string, ts: number): Awaitable<void>;
  getOrder(id: string): Awaitable<OrderRow | null>;
  getOrderByCharge(chargeId: string): Awaitable<OrderRow | null>;
  setOrderPaid(id: string, ts: number): Awaitable<void>;
  setOrderIssued(id: string, codeHash: string): Awaitable<void>;
  setOrderIssuedPlain(id: string, codeHash: string, codePlain: string): Awaitable<void>;
  getOrderPlainCode(orderId: string): Awaitable<string | null>;
  setOrderStatus(id: string, status: OrderRow["status"]): Awaitable<void>;
  setOrderPayout(orderId: string, patch: { status: NonNullable<OrderRow["payoutStatus"]>; ref?: string | null; error?: string | null; ts?: number }): Awaitable<void>;
  ordersPendingPayout(limit: number): Awaitable<OrderRow[]>;
  createCode(row: { codeHash: string; orderId: string; activatedTs: number; expiresTs: number }): Awaitable<void>;
  getCode(codeHash: string): Awaitable<CodeRow | null>;
  touchCode(codeHash: string, ts: number): Awaitable<void>;
  setCodeExpiry(codeHash: string, expiresTs: number): Awaitable<void>;
  setCodeStatus(codeHash: string, status: CodeRow["status"]): Awaitable<void>;
  activeCodeCount(): Awaitable<number>;
  saveFederationUpdate(ts: number, peerHash: string, tokens: number, epoch: number, batchJson: string): Awaitable<void>;
  recentFederationUpdates(limit: number): Awaitable<{ id: number; ts: number; peerHash: string; tokens: number; epoch: number; batchJson: string }[]>;
  pruneFederation(beforeTs: number): Awaitable<void>;
  recentOrders(limit: number): Awaitable<OrderRow[]>;
}

// Run one-by-one so an already-applied migration never skips later ones.
const SQLITE_MIGRATIONS = [
  `ALTER TABLE tt_orders ADD COLUMN payout_status TEXT`,
  `ALTER TABLE tt_orders ADD COLUMN payout_ref TEXT`,
  `ALTER TABLE tt_orders ADD COLUMN payout_error TEXT`,
  `ALTER TABLE tt_orders ADD COLUMN payout_ts INTEGER`,
];

const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS tt_orders (
  id TEXT PRIMARY KEY,
  charge_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_ts INTEGER NOT NULL,
  paid_ts INTEGER,
  code_hash TEXT,
  code_plain TEXT
);
CREATE INDEX IF NOT EXISTS idx_tt_orders_charge ON tt_orders(charge_id);

CREATE TABLE IF NOT EXISTS tt_codes (
  code_hash TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  activated_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  last_seen_ts INTEGER,
  calls_total INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tt_federation_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  peer_hash TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 0,
  batch_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tt_fed_ts ON tt_federation_updates(ts DESC);
`;

// Postgres: same tables; BIGINT columns are read back as strings, so Number() everywhere.
const SCHEMA_PG = `
CREATE TABLE IF NOT EXISTS tt_orders (
  id TEXT PRIMARY KEY,
  charge_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_ts BIGINT NOT NULL,
  paid_ts BIGINT,
  code_hash TEXT,
  code_plain TEXT
);
CREATE INDEX IF NOT EXISTS idx_tt_orders_charge ON tt_orders(charge_id);
ALTER TABLE tt_orders ADD COLUMN IF NOT EXISTS payout_status TEXT;
ALTER TABLE tt_orders ADD COLUMN IF NOT EXISTS payout_ref TEXT;
ALTER TABLE tt_orders ADD COLUMN IF NOT EXISTS payout_error TEXT;
ALTER TABLE tt_orders ADD COLUMN IF NOT EXISTS payout_ts BIGINT;

CREATE TABLE IF NOT EXISTS tt_codes (
  code_hash TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  activated_ts BIGINT NOT NULL,
  expires_ts BIGINT NOT NULL,
  last_seen_ts BIGINT,
  calls_total BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tt_federation_updates (
  id BIGSERIAL PRIMARY KEY,
  ts BIGINT NOT NULL,
  peer_hash TEXT NOT NULL,
  tokens BIGINT NOT NULL,
  epoch BIGINT NOT NULL DEFAULT 0,
  batch_json JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tt_fed_ts ON tt_federation_updates(ts DESC);
`;

let cachedSqlite: Database.Database | null = null;

// Postgres schema is created idempotently once per process via the shared
// self-healing client (core/pg.ts) — which also owns stale-socket recovery.
let pgSchemaReady: Promise<void> | null = null;
function ensurePgSchema(): Promise<void> {
  pgSchemaReady ??= pgQuery(SCHEMA_PG).then(() => undefined);
  return pgSchemaReady;
}

function sqliteDb(): Database.Database {
  if (cachedSqlite) return cachedSqlite;
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
  for (const m of SQLITE_MIGRATIONS) {
    try {
      db.exec(m);
    } catch {
      // duplicate column — already applied
    }
  }
  cachedSqlite = db;
  return db;
}

export function dbKind(): "sqlite" | "postgres" {
  return process.env.DATABASE_URL?.trim() ? "postgres" : "sqlite";
}

function rowToOrder(r: Record<string, unknown>): OrderRow {
  return {
    id: String(r.id),
    chargeId: String(r.charge_id),
    status: r.status as OrderRow["status"],
    createdTs: Number(r.created_ts),
    paidTs: r.paid_ts == null ? null : Number(r.paid_ts),
    codeHash: r.code_hash == null ? null : String(r.code_hash),
    codePlain: r.code_plain == null ? null : String(r.code_plain),
    payoutStatus: r.payout_status == null ? null : (String(r.payout_status) as OrderRow["payoutStatus"]),
    payoutRef: r.payout_ref == null ? null : String(r.payout_ref),
    payoutError: r.payout_error == null ? null : String(r.payout_error),
    payoutTs: r.payout_ts == null ? null : Number(r.payout_ts),
  };
}

/** JSONB columns arrive as strings (SQLite) or parsed objects (pg) — normalize. */
function jsonbText(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v ?? {});
}

function rowToCode(r: Record<string, unknown>): CodeRow {
  return {
    codeHash: String(r.code_hash),
    orderId: String(r.order_id),
    status: r.status as CodeRow["status"],
    activatedTs: Number(r.activated_ts),
    expiresTs: Number(r.expires_ts),
    lastSeenTs: r.last_seen_ts == null ? null : Number(r.last_seen_ts),
    callsTotal: Number(r.calls_total),
  };
}

class SqliteLicensingDb implements LicensingDb {
  readonly kind = "sqlite" as const;
  private db = sqliteDb();

  createOrder(id: string, chargeId: string, ts: number): void {
    this.db.prepare(`INSERT OR IGNORE INTO tt_orders (id, charge_id, status, created_ts) VALUES (?, ?, 'pending', ?)`).run(id, chargeId, ts);
  }
  getOrder(id: string): OrderRow | null {
    const r = this.db.prepare(`SELECT * FROM tt_orders WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return r ? rowToOrder(r) : null;
  }
  getOrderByCharge(chargeId: string): OrderRow | null {
    const r = this.db.prepare(`SELECT * FROM tt_orders WHERE charge_id = ?`).get(chargeId) as Record<string, unknown> | undefined;
    return r ? rowToOrder(r) : null;
  }
  setOrderPaid(id: string, ts: number): void {
    this.db.prepare(`UPDATE tt_orders SET status = 'paid', paid_ts = ? WHERE id = ?`).run(ts, id);
  }
  setOrderIssued(id: string, codeHash: string): void {
    this.db.prepare(`UPDATE tt_orders SET status = 'issued', code_hash = ? WHERE id = ?`).run(codeHash, id);
  }
  setOrderIssuedPlain(id: string, codeHash: string, codePlain: string): void {
    this.db.prepare(`UPDATE tt_orders SET status = 'issued', code_hash = ?, code_plain = ? WHERE id = ?`).run(codeHash, codePlain, id);
  }
  getOrderPlainCode(orderId: string): string | null {
    const r = this.db.prepare(`SELECT code_plain FROM tt_orders WHERE id = ?`).get(orderId) as { code_plain: string | null } | undefined;
    return r?.code_plain ?? null;
  }
  setOrderStatus(id: string, status: OrderRow["status"]): void {
    this.db.prepare(`UPDATE tt_orders SET status = ? WHERE id = ?`).run(status, id);
  }
  setOrderPayout(orderId: string, patch: { status: NonNullable<OrderRow["payoutStatus"]>; ref?: string | null; error?: string | null; ts?: number }): void {
    this.db
      .prepare(`UPDATE tt_orders SET payout_status = ?, payout_ref = COALESCE(?, payout_ref), payout_error = COALESCE(?, payout_error), payout_ts = COALESCE(?, payout_ts) WHERE id = ?`)
      .run(patch.status, patch.ref ?? null, patch.error ?? null, patch.ts ?? null, orderId);
  }
  ordersPendingPayout(limit: number): OrderRow[] {
    return (
      this.db
        .prepare(`SELECT * FROM tt_orders WHERE status = 'issued' AND (payout_status IS NULL OR payout_status = 'failed') ORDER BY created_ts DESC LIMIT ?`)
        .all(limit) as Record<string, unknown>[]
    ).map(rowToOrder);
  }
  createCode(row: { codeHash: string; orderId: string; activatedTs: number; expiresTs: number }): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO tt_codes (code_hash, order_id, status, activated_ts, expires_ts) VALUES (?, ?, 'active', ?, ?)`)
      .run(row.codeHash, row.orderId, row.activatedTs, row.expiresTs);
  }
  getCode(codeHash: string): CodeRow | null {
    const r = this.db.prepare(`SELECT * FROM tt_codes WHERE code_hash = ?`).get(codeHash) as Record<string, unknown> | undefined;
    return r ? rowToCode(r) : null;
  }
  touchCode(codeHash: string, ts: number): void {
    this.db.prepare(`UPDATE tt_codes SET last_seen_ts = ?, calls_total = calls_total + 1 WHERE code_hash = ?`).run(ts, codeHash);
  }
  setCodeExpiry(codeHash: string, expiresTs: number): void {
    this.db.prepare(`UPDATE tt_codes SET expires_ts = ? WHERE code_hash = ?`).run(expiresTs, codeHash);
  }
  setCodeStatus(codeHash: string, status: CodeRow["status"]): void {
    this.db.prepare(`UPDATE tt_codes SET status = ? WHERE code_hash = ?`).run(status, codeHash);
  }
  activeCodeCount(): number {
    const r = this.db.prepare(`SELECT COUNT(*) AS n FROM tt_codes WHERE status = 'active' AND expires_ts > ?`).get(Date.now()) as { n: number };
    return Number(r.n);
  }
  saveFederationUpdate(ts: number, peerHash: string, tokens: number, epoch: number, batchJson: string): void {
    this.db.prepare(`INSERT INTO tt_federation_updates (ts, peer_hash, tokens, epoch, batch_json) VALUES (?, ?, ?, ?, ?)`).run(ts, peerHash, tokens, epoch, batchJson);
  }
  recentFederationUpdates(limit: number) {
    return (
      this.db
        .prepare(`SELECT id, ts, peer_hash, tokens, epoch, batch_json FROM tt_federation_updates ORDER BY ts DESC LIMIT ?`)
        .all(limit) as Record<string, unknown>[]
    ).map((r) => ({
      id: Number(r.id),
      ts: Number(r.ts),
      peerHash: String(r.peer_hash),
      tokens: Number(r.tokens),
      epoch: Number(r.epoch),
      batchJson: String(r.batch_json),
    }));
  }
  pruneFederation(beforeTs: number): void {
    this.db.prepare(`DELETE FROM tt_federation_updates WHERE ts < ?`).run(beforeTs);
  }
  recentOrders(limit: number): OrderRow[] {
    return (
      this.db.prepare(`SELECT * FROM tt_orders ORDER BY created_ts DESC LIMIT ?`).all(limit) as Record<string, unknown>[]
    ).map(rowToOrder);
  }
}

class PostgresLicensingDb implements LicensingDb {
  readonly kind = "postgres" as const;
  private async q(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    await ensurePgSchema();
    return pgQuery(sql, params);
  }

  async createOrder(id: string, chargeId: string, ts: number): Promise<void> {
    await this.q(`INSERT INTO tt_orders (id, charge_id, status, created_ts) VALUES ($1, $2, 'pending', $3) ON CONFLICT (id) DO NOTHING`, [id, chargeId, ts]);
  }
  async getOrder(id: string): Promise<OrderRow | null> {
    const rows = await this.q(`SELECT * FROM tt_orders WHERE id = $1`, [id]);
    return rows[0] ? rowToOrder(rows[0]) : null;
  }
  async getOrderByCharge(chargeId: string): Promise<OrderRow | null> {
    const rows = await this.q(`SELECT * FROM tt_orders WHERE charge_id = $1`, [chargeId]);
    return rows[0] ? rowToOrder(rows[0]) : null;
  }
  async setOrderPaid(id: string, ts: number): Promise<void> {
    await this.q(`UPDATE tt_orders SET status = 'paid', paid_ts = $2 WHERE id = $1`, [id, ts]);
  }
  async setOrderIssued(id: string, codeHash: string): Promise<void> {
    await this.q(`UPDATE tt_orders SET status = 'issued', code_hash = $2 WHERE id = $1`, [id, codeHash]);
  }
  async setOrderIssuedPlain(id: string, codeHash: string, codePlain: string): Promise<void> {
    await this.q(`UPDATE tt_orders SET status = 'issued', code_hash = $2, code_plain = $3 WHERE id = $1`, [id, codeHash, codePlain]);
  }
  async getOrderPlainCode(orderId: string): Promise<string | null> {
    const rows = await this.q(`SELECT code_plain FROM tt_orders WHERE id = $1`, [orderId]);
    return rows[0] ? (rows[0].code_plain == null ? null : String(rows[0].code_plain)) : null;
  }
  async setOrderStatus(id: string, status: OrderRow["status"]): Promise<void> {
    await this.q(`UPDATE tt_orders SET status = $2 WHERE id = $1`, [id, status]);
  }
  async setOrderPayout(orderId: string, patch: { status: NonNullable<OrderRow["payoutStatus"]>; ref?: string | null; error?: string | null; ts?: number }): Promise<void> {
    await this.q(
      `UPDATE tt_orders SET payout_status = $2, payout_ref = COALESCE($3, payout_ref), payout_error = COALESCE($4, payout_error), payout_ts = COALESCE($5, payout_ts) WHERE id = $1`,
      [orderId, patch.status, patch.ref ?? null, patch.error ?? null, patch.ts ?? null],
    );
  }
  async ordersPendingPayout(limit: number): Promise<OrderRow[]> {
    const rows = await this.q(
      `SELECT * FROM tt_orders WHERE status = 'issued' AND (payout_status IS NULL OR payout_status = 'failed') ORDER BY created_ts DESC LIMIT $1`,
      [limit],
    );
    return rows.map(rowToOrder);
  }
  async createCode(row: { codeHash: string; orderId: string; activatedTs: number; expiresTs: number }): Promise<void> {
    await this.q(
      `INSERT INTO tt_codes (code_hash, order_id, status, activated_ts, expires_ts) VALUES ($1, $2, 'active', $3, $4) ON CONFLICT (code_hash) DO NOTHING`,
      [row.codeHash, row.orderId, row.activatedTs, row.expiresTs],
    );
  }
  async getCode(codeHash: string): Promise<CodeRow | null> {
    const rows = await this.q(`SELECT * FROM tt_codes WHERE code_hash = $1`, [codeHash]);
    return rows[0] ? rowToCode(rows[0]) : null;
  }
  async touchCode(codeHash: string, ts: number): Promise<void> {
    await this.q(`UPDATE tt_codes SET last_seen_ts = $2, calls_total = calls_total + 1 WHERE code_hash = $1`, [codeHash, ts]);
  }
  async setCodeExpiry(codeHash: string, expiresTs: number): Promise<void> {
    await this.q(`UPDATE tt_codes SET expires_ts = $2 WHERE code_hash = $1`, [codeHash, expiresTs]);
  }
  async setCodeStatus(codeHash: string, status: CodeRow["status"]): Promise<void> {
    await this.q(`UPDATE tt_codes SET status = $2 WHERE code_hash = $1`, [codeHash, status]);
  }
  async activeCodeCount(): Promise<number> {
    const rows = await this.q(`SELECT COUNT(*)::int AS n FROM tt_codes WHERE status = 'active' AND expires_ts > $1`, [Date.now()]);
    return Number(rows[0]?.n ?? 0);
  }
  async saveFederationUpdate(ts: number, peerHash: string, tokens: number, epoch: number, batchJson: string): Promise<void> {
    await this.q(`INSERT INTO tt_federation_updates (ts, peer_hash, tokens, epoch, batch_json) VALUES ($1, $2, $3, $4, $5)`, [ts, peerHash, tokens, epoch, batchJson]);
  }
  async recentFederationUpdates(limit: number) {
    const rows = await this.q(`SELECT id, ts, peer_hash, tokens, epoch, batch_json FROM tt_federation_updates ORDER BY ts DESC LIMIT $1`, [limit]);
    return rows.map((r) => ({
      id: Number(r.id),
      ts: Number(r.ts),
      peerHash: String(r.peer_hash),
      tokens: Number(r.tokens),
      epoch: Number(r.epoch),
      batchJson: jsonbText(r.batch_json),
    }));
  }
  async pruneFederation(beforeTs: number): Promise<void> {
    await this.q(`DELETE FROM tt_federation_updates WHERE ts < $1`, [beforeTs]);
  }
  async recentOrders(limit: number): Promise<OrderRow[]> {
    const rows = await this.q(`SELECT * FROM tt_orders ORDER BY created_ts DESC LIMIT $1`, [limit]);
    return rows.map(rowToOrder);
  }
}

export function licensingDb(): LicensingDb {
  return dbKind() === "postgres" ? new PostgresLicensingDb() : new SqliteLicensingDb();
}
