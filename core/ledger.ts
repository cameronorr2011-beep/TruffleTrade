import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import type { AccountState, CycleRecord, LedgerTrade } from "./types";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
  db = new Database(config.sqlitePath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      side TEXT NOT NULL,
      qty_btc REAL NOT NULL,
      price REAL NOT NULL,
      fee_usd REAL NOT NULL DEFAULT 0,
      slippage_usd REAL NOT NULL DEFAULT 0,
      realized_pnl_usd REAL,
      mode TEXT NOT NULL,
      reason TEXT NOT NULL,
      cycle_id INTEGER,
      ref TEXT
    );
    CREATE TABLE IF NOT EXISTS cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      mode TEXT NOT NULL,
      btc_price REAL NOT NULL,
      decision TEXT NOT NULL,
      executed INTEGER NOT NULL,
      equity_after REAL NOT NULL,
      council_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS equity (
      ts INTEGER PRIMARY KEY,
      equity_usd REAL NOT NULL,
      mode TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function recordTrade(t: LedgerTrade): number {
  const stmt = getDb().prepare(
    `INSERT INTO trades (ts, side, qty_btc, price, fee_usd, slippage_usd, realized_pnl_usd, mode, reason, cycle_id, ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const r = stmt.run(t.ts, t.side, t.qtyBtc, t.price, t.feeUsd, t.slippageUsd, t.realizedPnlUsd, t.mode, t.reason, t.cycleId ?? null, t.ref ?? null);
  return Number(r.lastInsertRowid);
}

export function recordCycle(c: Omit<CycleRecord, "id">): number {
  const stmt = getDb().prepare(
    `INSERT INTO cycles (ts, mode, btc_price, decision, executed, equity_after, council_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const r = stmt.run(c.ts, c.mode, c.btcPrice, c.decision, c.executed ? 1 : 0, c.equityAfter, c.councilJson);
  return Number(r.lastInsertRowid);
}

export function recordEquity(ts: number, equityUsd: number, mode: string): void {
  getDb()
    .prepare(
      `INSERT INTO equity (ts, equity_usd, mode) VALUES (?, ?, ?)
       ON CONFLICT(ts) DO UPDATE SET equity_usd = excluded.equity_usd, mode = excluded.mode`,
    )
    .run(ts, equityUsd, mode);
}

export function getState(key: string): string | null {
  const row = getDb().prepare(`SELECT value FROM state WHERE key = ?`).get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setState(key: string, value: string): void {
  getDb()
    .prepare(`INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, value);
}

export function loadAccount(startUsd: number): AccountState {
  const raw = getState("account");
  if (raw) {
    try {
      return JSON.parse(raw) as AccountState;
    } catch {
      // fall through to fresh
    }
  }
  return {
    equityUsd: startUsd,
    cashUsd: startUsd,
    position: { side: "flat", qtyBtc: 0, entryPrice: 0, openedTs: 0 },
    peakEquityUsd: startUsd,
    halted: false,
  };
}

export function saveAccount(a: AccountState): void {
  setState("account", JSON.stringify(a));
}

export function recentTrades(limit = 25): LedgerTrade[] {
  const rows = getDb()
    .prepare(`SELECT * FROM trades ORDER BY id DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    ts: Number(r.ts),
    side: r.side as LedgerTrade["side"],
    qtyBtc: Number(r.qty_btc),
    price: Number(r.price),
    feeUsd: Number(r.fee_usd),
    slippageUsd: Number(r.slippage_usd),
    realizedPnlUsd: r.realized_pnl_usd == null ? null : Number(r.realized_pnl_usd),
    mode: r.mode as LedgerTrade["mode"],
    reason: String(r.reason),
    cycleId: r.cycle_id == null ? undefined : Number(r.cycle_id),
    ref: r.ref == null ? undefined : String(r.ref),
  }));
}

export function equityCurve(limit = 240): { ts: number; equityUsd: number }[] {
  const rows = getDb()
    .prepare(`SELECT ts, equity_usd FROM equity ORDER BY ts DESC LIMIT ?`)
    .all(limit) as { ts: number; equity_usd: number }[];
  return rows.reverse().map((r) => ({ ts: Number(r.ts), equityUsd: Number(r.equity_usd) }));
}

export function stats(): {
  trades: number;
  wins: number;
  losses: number;
  realizedPnlUsd: number;
  winRate: number | null;
} {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n,
              SUM(CASE WHEN realized_pnl_usd > 0 THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN realized_pnl_usd <= 0 THEN 1 ELSE 0 END) AS losses,
              COALESCE(SUM(realized_pnl_usd), 0) AS pnl
       FROM trades WHERE realized_pnl_usd IS NOT NULL`,
    )
    .get() as { n: number; wins: number | null; losses: number | null; pnl: number };
  const n = Number(row.n);
  return {
    trades: n,
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    realizedPnlUsd: Number(row.pnl),
    winRate: n ? Number(row.wins ?? 0) / n : null,
  };
}
