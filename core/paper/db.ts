// Paper-trading + audit persistence. Same dual-backend convention as
// core/licensing/db.ts: SQLite locally, Postgres (Neon) on Vercel. Schema is
// created idempotently at first use; no manual production schema changes.
// Paper state is per-code-hash (ownerCodeHash): cross-user isolation is
// enforced by construction — every query is scoped to the caller's code hash.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { licensingDb, type Awaitable, dbKind } from "../licensing/db";

export interface PaperAccountRow {
  id: number;
  ownerCodeHash: string;
  cashUsd: number;
  startUsd: number;
  createdAt: number;
  peakValueUsd: number;
  assumptionsJson: string;
}

export interface PaperOrderRow {
  id: number;
  accountId: number;
  ticker: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  quantity: number;
  limitPrice: number | null;
  status: "pending" | "filled" | "cancelled" | "rejected";
  reason: string | null;
  createdAt: number;
}

export interface PaperFillRow {
  id: number;
  orderId: number;
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  priceUsd: number;
  feeUsd: number;
  slippageUsd: number;
  realizedPnlUsd: number;
  ts: number;
}

export interface PaperPositionRow {
  accountId: number;
  ticker: string;
  quantity: number;
  avgCostUsd: number;
}

export interface AuditEventRow {
  id: number;
  ts: number;
  actorHash: string; // code hash or "system"/"admin" — never raw identifiers
  event: string;
  detailJson: string;
}

export interface PaperStore {
  kind: "sqlite" | "postgres";
  // accounts
  getOrCreateAccount(ownerCodeHash: string, startUsd: number, assumptionsJson: string): Awaitable<PaperAccountRow>;
  getAccount(ownerCodeHash: string): Awaitable<PaperAccountRow | null>;
  updateAccountCash(accountId: number, cashUsd: number, peakValueUsd: number): Awaitable<void>;
  // orders
  insertOrder(o: Omit<PaperOrderRow, "id">): Awaitable<number>;
  setOrderStatus(orderId: number, status: PaperOrderRow["status"], reason: string | null): Awaitable<void>;
  getOrder(accountId: number, orderId: number): Awaitable<PaperOrderRow | null>;
  recentOrders(accountId: number, limit: number): Awaitable<PaperOrderRow[]>;
  // fills
  insertFill(f: Omit<PaperFillRow, "id">): Awaitable<number>;
  recentFills(accountId: number, limit: number): Awaitable<PaperFillRow[]>;
  // positions
  upsertPosition(accountId: number, ticker: string, quantity: number, avgCostUsd: number): Awaitable<void>;
  deletePosition(accountId: number, ticker: string): Awaitable<void>;
  positions(accountId: number): Awaitable<PaperPositionRow[]>;
  // audit (append-only)
  audit(event: string, actorHash: string, detail: Record<string, unknown>): Awaitable<void>;
  recentAudit(limit: number): Awaitable<AuditEventRow[]>;
}

const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS tt_paper_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_code_hash TEXT NOT NULL UNIQUE,
  cash_usd REAL NOT NULL,
  start_usd REAL NOT NULL,
  created_ts INTEGER NOT NULL,
  peak_value_usd REAL NOT NULL,
  assumptions_json TEXT NOT NULL,
  CHECK (cash_usd >= 0)
);
CREATE TABLE IF NOT EXISTS tt_paper_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES tt_paper_accounts(id),
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  type TEXT NOT NULL CHECK (type IN ('market','limit')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  limit_price REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','filled','cancelled','rejected')),
  reason TEXT,
  created_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tt_paper_orders_acct ON tt_paper_orders(account_id, created_ts DESC);
CREATE TABLE IF NOT EXISTS tt_paper_fills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES tt_paper_orders(id),
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  price_usd REAL NOT NULL CHECK (price_usd > 0),
  fee_usd REAL NOT NULL DEFAULT 0,
  slippage_usd REAL NOT NULL DEFAULT 0,
  realized_pnl_usd REAL NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tt_paper_fills_acct ON tt_paper_fills(ts DESC);
CREATE TABLE IF NOT EXISTS tt_paper_positions (
  account_id INTEGER NOT NULL REFERENCES tt_paper_accounts(id),
  ticker TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity >= 0),
  avg_cost_usd REAL NOT NULL CHECK (avg_cost_usd >= 0),
  PRIMARY KEY (account_id, ticker)
);
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
CREATE TABLE IF NOT EXISTS tt_paper_accounts (
  id BIGSERIAL PRIMARY KEY,
  owner_code_hash TEXT NOT NULL UNIQUE,
  cash_usd DOUBLE PRECISION NOT NULL,
  start_usd DOUBLE PRECISION NOT NULL,
  created_ts BIGINT NOT NULL,
  peak_value_usd DOUBLE PRECISION NOT NULL,
  assumptions_json JSONB NOT NULL,
  CHECK (cash_usd >= 0)
);
CREATE TABLE IF NOT EXISTS tt_paper_orders (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES tt_paper_accounts(id),
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  type TEXT NOT NULL CHECK (type IN ('market','limit')),
  quantity DOUBLE PRECISION NOT NULL CHECK (quantity > 0),
  limit_price DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','filled','cancelled','rejected')),
  reason TEXT,
  created_ts BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tt_paper_orders_acct ON tt_paper_orders(account_id, created_ts DESC);
CREATE TABLE IF NOT EXISTS tt_paper_fills (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES tt_paper_orders(id),
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL CHECK (quantity > 0),
  price_usd DOUBLE PRECISION NOT NULL CHECK (price_usd > 0),
  fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  slippage_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  realized_pnl_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  ts BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tt_paper_fills_acct ON tt_paper_fills(ts DESC);
CREATE TABLE IF NOT EXISTS tt_paper_positions (
  account_id BIGINT NOT NULL REFERENCES tt_paper_accounts(id),
  ticker TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL CHECK (quantity >= 0),
  avg_cost_usd DOUBLE PRECISION NOT NULL CHECK (avg_cost_usd >= 0),
  PRIMARY KEY (account_id, ticker)
);
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
  var __ttPaperPg: PgClient | null | undefined;
  // eslint-disable-next-line no-var
  var __ttPaperSqlite: Database.Database | undefined;
}

let cachedSqlite: Database.Database | null = null;

function sqliteHandle(): Database.Database {
  if (cachedSqlite) return cachedSqlite;
  const file = process.env.SQLITE_PATH?.trim() || "data/truffletrade.sqlite3";
  const dir = path.dirname(path.resolve(file));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQLITE);
  cachedSqlite = db;
  return db;
}

function rowToAccount(r: Record<string, unknown>): PaperAccountRow {
  return {
    id: Number(r.id),
    ownerCodeHash: String(r.owner_code_hash),
    cashUsd: Number(r.cash_usd),
    startUsd: Number(r.start_usd),
    createdAt: Number(r.created_ts),
    peakValueUsd: Number(r.peak_value_usd ?? r.start_usd),
    assumptionsJson: jsonbText(r.assumptions_json),
  };
}
function rowToOrder(r: Record<string, unknown>): PaperOrderRow {
  return {
    id: Number(r.id),
    accountId: Number(r.account_id),
    ticker: String(r.ticker),
    side: r.side as PaperOrderRow["side"],
    type: r.type as PaperOrderRow["type"],
    quantity: Number(r.quantity),
    limitPrice: r.limit_price == null ? null : Number(r.limit_price),
    status: r.status as PaperOrderRow["status"],
    reason: r.reason == null ? null : String(r.reason),
    createdAt: Number(r.created_ts),
  };
}
function rowToFill(r: Record<string, unknown>): PaperFillRow {
  return {
    id: Number(r.id),
    orderId: Number(r.order_id),
    ticker: String(r.ticker),
    side: r.side as PaperFillRow["side"],
    quantity: Number(r.quantity),
    priceUsd: Number(r.price_usd),
    feeUsd: Number(r.fee_usd),
    slippageUsd: Number(r.slippage_usd),
    realizedPnlUsd: Number(r.realized_pnl_usd),
    ts: Number(r.ts),
  };
}

class SqlitePaperStore implements PaperStore {
  readonly kind = "sqlite" as const;

  getOrCreateAccount(ownerCodeHash: string, startUsd: number, assumptionsJson: string): PaperAccountRow {
    const rows = this.all(`SELECT * FROM tt_paper_accounts WHERE owner_code_hash = ?`, [ownerCodeHash]);
    if (rows[0]) return rowToAccount(rows[0]);
    this.run(
      `INSERT INTO tt_paper_accounts (owner_code_hash, cash_usd, start_usd, created_ts, peak_value_usd, assumptions_json)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (owner_code_hash) DO NOTHING`,
      [ownerCodeHash, startUsd, startUsd, Date.now(), startUsd, assumptionsJson],
    );
    const created = this.all(`SELECT * FROM tt_paper_accounts WHERE owner_code_hash = ?`, [ownerCodeHash]);
    if (!created[0]) throw new Error("failed to create paper account");
    return rowToAccount(created[0]);
  }
  getAccount(ownerCodeHash: string): PaperAccountRow | null {
    const rows = this.all(`SELECT * FROM tt_paper_accounts WHERE owner_code_hash = ?`, [ownerCodeHash]);
    return rows[0] ? rowToAccount(rows[0]) : null;
  }
  updateAccountCash(accountId: number, cashUsd: number, peakValueUsd: number): void {
    this.run(`UPDATE tt_paper_accounts SET cash_usd = ?, peak_value_usd = MAX(peak_value_usd, ?) WHERE id = ?`, [cashUsd, peakValueUsd, accountId]);
  }
  insertOrder(o: Omit<PaperOrderRow, "id">): number {
    const res = this.run(
      `INSERT INTO tt_paper_orders (account_id, ticker, side, type, quantity, limit_price, status, reason, created_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [o.accountId, o.ticker, o.side, o.type, o.quantity, o.limitPrice, o.status, o.reason, o.createdAt],
    );
    return Number(res.lastInsertRowid);
  }
  setOrderStatus(orderId: number, status: PaperOrderRow["status"], reason: string | null): void {
    this.run(`UPDATE tt_paper_orders SET status = ?, reason = ? WHERE id = ?`, [status, reason, orderId]);
  }
  getOrder(accountId: number, orderId: number): PaperOrderRow | null {
    const rows = this.all(`SELECT * FROM tt_paper_orders WHERE id = ? AND account_id = ?`, [orderId, accountId]);
    return rows[0] ? rowToOrder(rows[0]) : null;
  }
  recentOrders(accountId: number, limit: number): PaperOrderRow[] {
    return this.all(`SELECT * FROM tt_paper_orders WHERE account_id = ? ORDER BY created_ts DESC, id DESC LIMIT ?`, [accountId, limit]).map(rowToOrder);
  }
  insertFill(f: Omit<PaperFillRow, "id">): number {
    const res = this.run(
      `INSERT INTO tt_paper_fills (order_id, ticker, side, quantity, price_usd, fee_usd, slippage_usd, realized_pnl_usd, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [f.orderId, f.ticker, f.side, f.quantity, f.priceUsd, f.feeUsd, f.slippageUsd, f.realizedPnlUsd, f.ts],
    );
    return Number(res.lastInsertRowid);
  }
  recentFills(accountId: number, limit: number): PaperFillRow[] {
    return this.all(
      `SELECT f.* FROM tt_paper_fills f JOIN tt_paper_orders o ON o.id = f.order_id WHERE o.account_id = ? ORDER BY f.ts DESC, f.id DESC LIMIT ?`,
      [accountId, limit],
    ).map(rowToFill);
  }
  upsertPosition(accountId: number, ticker: string, quantity: number, avgCostUsd: number): void {
    if (quantity <= 1e-9) {
      this.run(`DELETE FROM tt_paper_positions WHERE account_id = ? AND ticker = ?`, [accountId, ticker]);
      return;
    }
    this.run(
      `INSERT INTO tt_paper_positions (account_id, ticker, quantity, avg_cost_usd) VALUES (?, ?, ?, ?)
       ON CONFLICT (account_id, ticker) DO UPDATE SET quantity = excluded.quantity, avg_cost_usd = excluded.avg_cost_usd`,
      [accountId, ticker, quantity, avgCostUsd],
    );
  }
  deletePosition(accountId: number, ticker: string): void {
    this.run(`DELETE FROM tt_paper_positions WHERE account_id = ? AND ticker = ?`, [accountId, ticker]);
  }
  positions(accountId: number): PaperPositionRow[] {
    return this.all(`SELECT * FROM tt_paper_positions WHERE account_id = ?`, [accountId]).map((r) => ({
      accountId: Number(r.account_id),
      ticker: String(r.ticker),
      quantity: Number(r.quantity),
      avgCostUsd: Number(r.avg_cost_usd),
    }));
  }
  audit(event: string, actorHash: string, detail: Record<string, unknown>): void {
    this.run(`INSERT INTO tt_audit_events (ts, actor_hash, event, detail_json) VALUES (?, ?, ?, ?)`, [Date.now(), actorHash, event, JSON.stringify(detail)]);
  }
  recentAudit(limit: number): AuditEventRow[] {
    return this.all(`SELECT * FROM tt_audit_events ORDER BY ts DESC, id DESC LIMIT ?`, [limit]).map((r) => ({
      id: Number(r.id),
      ts: Number(r.ts),
      actorHash: String(r.actor_hash),
      event: String(r.event),
      detailJson: jsonbText(r.detail_json),
    }));
  }  // thin helpers over a module-singleton sqlite handle
  private all(sql: string, params: unknown[]): Record<string, unknown>[] {
    return sqliteHandle().prepare(sql).all(...params) as Record<string, unknown>[];
  }
  private run(sql: string, params: unknown[]): { lastInsertRowid: number | bigint; changes: number } {
    return sqliteHandle().prepare(sql).run(...params) as { lastInsertRowid: number | bigint; changes: number };
  }
}

class PostgresPaperStore implements PaperStore {
  readonly kind = "postgres" as const;
  private async q(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const g = globalThis as unknown as { __ttPaperPg?: PgClient | null };
    if (!g.__ttPaperPg) {
      const url = process.env.DATABASE_URL?.trim();
      if (!url) throw new Error("DATABASE_URL is required for the Postgres paper backend.");
      const { Client } = await import("pg");
      const client = new Client({ connectionString: url });
      await client.connect();
      await client.query(SCHEMA_PG);
      g.__ttPaperPg = client as unknown as PgClient;
    }
    return (await g.__ttPaperPg.query(sql, params)).rows;
  }

  async getOrCreateAccount(ownerCodeHash: string, startUsd: number, assumptionsJson: string): Promise<PaperAccountRow> {
    const rows = await this.q(`SELECT * FROM tt_paper_accounts WHERE owner_code_hash = $1`, [ownerCodeHash]);
    if (rows[0]) return rowToAccount(rows[0]);
    await this.q(
      `INSERT INTO tt_paper_accounts (owner_code_hash, cash_usd, start_usd, created_ts, peak_value_usd, assumptions_json)
       VALUES ($1, $2, $2, $3, $2, $4) ON CONFLICT (owner_code_hash) DO NOTHING`,
      [ownerCodeHash, startUsd, Date.now(), assumptionsJson],
    );
    const created = await this.q(`SELECT * FROM tt_paper_accounts WHERE owner_code_hash = $1`, [ownerCodeHash]);
    if (!created[0]) throw new Error("failed to create paper account");
    return rowToAccount(created[0]);
  }
  async getAccount(ownerCodeHash: string): Promise<PaperAccountRow | null> {
    const rows = await this.q(`SELECT * FROM tt_paper_accounts WHERE owner_code_hash = $1`, [ownerCodeHash]);
    return rows[0] ? rowToAccount(rows[0]) : null;
  }
  async updateAccountCash(accountId: number, cashUsd: number, peakValueUsd: number): Promise<void> {
    await this.q(`UPDATE tt_paper_accounts SET cash_usd = $2, peak_value_usd = GREATEST(peak_value_usd, $3) WHERE id = $1`, [accountId, cashUsd, peakValueUsd]);
  }
  async insertOrder(o: Omit<PaperOrderRow, "id">): Promise<number> {
    const rows = await this.q(
      `INSERT INTO tt_paper_orders (account_id, ticker, side, type, quantity, limit_price, status, reason, created_ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [o.accountId, o.ticker, o.side, o.type, o.quantity, o.limitPrice, o.status, o.reason, o.createdAt],
    );
    return Number(rows[0].id);
  }
  async setOrderStatus(orderId: number, status: PaperOrderRow["status"], reason: string | null): Promise<void> {
    await this.q(`UPDATE tt_paper_orders SET status = $2, reason = $3 WHERE id = $1`, [orderId, status, reason]);
  }
  async getOrder(accountId: number, orderId: number): Promise<PaperOrderRow | null> {
    const rows = await this.q(`SELECT * FROM tt_paper_orders WHERE id = $1 AND account_id = $2`, [orderId, accountId]);
    return rows[0] ? rowToOrder(rows[0]) : null;
  }
  async recentOrders(accountId: number, limit: number): Promise<PaperOrderRow[]> {
    const rows = await this.q(`SELECT * FROM tt_paper_orders WHERE account_id = $1 ORDER BY created_ts DESC, id DESC LIMIT $2`, [accountId, limit]);
    return rows.map(rowToOrder);
  }
  async insertFill(f: Omit<PaperFillRow, "id">): Promise<number> {
    const rows = await this.q(
      `INSERT INTO tt_paper_fills (order_id, ticker, side, quantity, price_usd, fee_usd, slippage_usd, realized_pnl_usd, ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [f.orderId, f.ticker, f.side, f.quantity, f.priceUsd, f.feeUsd, f.slippageUsd, f.realizedPnlUsd, f.ts],
    );
    return Number(rows[0].id);
  }
  async recentFills(accountId: number, limit: number): Promise<PaperFillRow[]> {
    const rows = await this.q(
      `SELECT f.* FROM tt_paper_fills f JOIN tt_paper_orders o ON o.id = f.order_id WHERE o.account_id = $1 ORDER BY f.ts DESC, f.id DESC LIMIT $2`,
      [accountId, limit],
    );
    return rows.map(rowToFill);
  }
  async upsertPosition(accountId: number, ticker: string, quantity: number, avgCostUsd: number): Promise<void> {
    if (quantity <= 1e-9) {
      await this.q(`DELETE FROM tt_paper_positions WHERE account_id = $1 AND ticker = $2`, [accountId, ticker]);
      return;
    }
    await this.q(
      `INSERT INTO tt_paper_positions (account_id, ticker, quantity, avg_cost_usd) VALUES ($1,$2,$3,$4)
       ON CONFLICT (account_id, ticker) DO UPDATE SET quantity = excluded.quantity, avg_cost_usd = excluded.avg_cost_usd`,
      [accountId, ticker, quantity, avgCostUsd],
    );
  }
  async deletePosition(accountId: number, ticker: string): Promise<void> {
    await this.q(`DELETE FROM tt_paper_positions WHERE account_id = $1 AND ticker = $2`, [accountId, ticker]);
  }
  async positions(accountId: number): Promise<PaperPositionRow[]> {
    const rows = await this.q(`SELECT * FROM tt_paper_positions WHERE account_id = $1`, [accountId]);
    return rows.map((r) => ({
      accountId: Number(r.account_id),
      ticker: String(r.ticker),
      quantity: Number(r.quantity),
      avgCostUsd: Number(r.avg_cost_usd),
    }));
  }
  async audit(event: string, actorHash: string, detail: Record<string, unknown>): Promise<void> {
    await this.q(`INSERT INTO tt_audit_events (ts, actor_hash, event, detail_json) VALUES ($1,$2,$3,$4)`, [Date.now(), actorHash, event, JSON.stringify(detail)]);
  }
  async recentAudit(limit: number): Promise<AuditEventRow[]> {
    const rows = await this.q(`SELECT * FROM tt_audit_events ORDER BY ts DESC, id DESC LIMIT $1`, [limit]);
    return rows.map((r) => ({
      id: Number(r.id),
      ts: Number(r.ts),
      actorHash: String(r.actor_hash),
      event: String(r.event),
      detailJson: jsonbText(r.detail_json),
    }));
  }
}

export function paperStore(): PaperStore {
  return dbKind() === "postgres" ? new PostgresPaperStore() : new SqlitePaperStore();
}

export type { Awaitable };
