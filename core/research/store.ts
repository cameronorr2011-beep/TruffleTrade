// Research persistence — SQLite via better-sqlite3, same pattern as core/ledger.ts.
// Tables: research_runs, theses (history), forecasts (+ resolution), watchlist.

import Database from "better-sqlite3";
import { getDb } from "../db";
import type { AgentOutput, ConsensusResult, DataPack, ResearchRun, StoredForecast, Thesis, ValuationModel } from "./types";

function ensureTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS research_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      status TEXT NOT NULL,
      consensus_json TEXT NOT NULL,
      thesis_json TEXT NOT NULL,
      agents_json TEXT NOT NULL,
      valuation_json TEXT NOT NULL,
      datapack_json TEXT NOT NULL,
      forecast_json TEXT,
      prompt_versions_json TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      errors_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_research_runs_ticker ON research_runs(ticker, ts DESC);

    CREATE TABLE IF NOT EXISTS theses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      ts INTEGER NOT NULL,
      stance TEXT NOT NULL,
      summary TEXT NOT NULL,
      thesis_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_theses_ticker ON theses(ticker, ts DESC);

    CREATE TABLE IF NOT EXISTS forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      ts INTEGER NOT NULL,
      horizon_days INTEGER NOT NULL,
      direction TEXT NOT NULL,
      expected_move_pct REAL,
      price_at_forecast REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      resolved_ts INTEGER,
      actual_move_pct REAL,
      correct INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_forecasts_ticker ON forecasts(ticker, ts DESC);

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      added_ts INTEGER NOT NULL,
      note TEXT
    );
  `);
}

function researchDb(): Database.Database {
  const db = getDb();
  ensureTables(db);
  return db;
}

export function saveResearchRun(run: Omit<ResearchRun, "id">): number {
  const db = researchDb();
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO research_runs
         (ts, ticker, status, consensus_json, thesis_json, agents_json, valuation_json, datapack_json, forecast_json, prompt_versions_json, duration_ms, errors_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        run.ts,
        run.ticker,
        run.status,
        JSON.stringify(run.consensus),
        JSON.stringify(run.thesis),
        JSON.stringify(run.agents),
        JSON.stringify(run.valuation),
        JSON.stringify(run.dataPack),
        run.forecast ? JSON.stringify(run.forecast) : null,
        JSON.stringify(run.promptVersions),
        run.durationMs,
        JSON.stringify(run.errors),
      );
    const runId = Number(r.lastInsertRowid);
    db.prepare(`INSERT INTO theses (run_id, ticker, ts, stance, summary, thesis_json) VALUES (?, ?, ?, ?, ?, ?)`).run(
      runId,
      run.ticker,
      run.ts,
      run.thesis.stance,
      run.thesis.summary.slice(0, 2000),
      JSON.stringify(run.thesis),
    );
    if (run.forecast) {
      db.prepare(
        `INSERT INTO forecasts (run_id, ticker, ts, horizon_days, direction, expected_move_pct, price_at_forecast, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      ).run(
        runId,
        run.ticker,
        run.ts,
        run.forecast.horizonDays,
        run.forecast.direction,
        run.forecast.expectedMovePct,
        run.forecast.priceAtForecast,
      );
    }
    return runId;
  });
  return tx();
}

export function getResearchRun(id: number): ResearchRun | null {
  const row = researchDb()
    .prepare(`SELECT * FROM research_runs WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToRun(row);
}

function rowToRun(row: Record<string, unknown>): ResearchRun {
  return {
    id: Number(row.id),
    ticker: String(row.ticker),
    ts: Number(row.ts),
    status: row.status as ResearchRun["status"],
    consensus: JSON.parse(String(row.consensus_json)) as ConsensusResult,
    thesis: JSON.parse(String(row.thesis_json)) as Thesis,
    agents: JSON.parse(String(row.agents_json)) as AgentOutput[],
    valuation: JSON.parse(String(row.valuation_json)) as ValuationModel,
    dataPack: JSON.parse(String(row.datapack_json)) as DataPack,
    forecast: row.forecast_json ? (JSON.parse(String(row.forecast_json)) as ResearchRun["forecast"]) : null,
    promptVersions: JSON.parse(String(row.prompt_versions_json)) as Record<string, string>,
    durationMs: Number(row.duration_ms),
    errors: JSON.parse(String(row.errors_json)) as string[],
  };
}

export function latestRunForTicker(ticker: string): ResearchRun | null {
  const row = researchDb()
    .prepare(`SELECT * FROM research_runs WHERE ticker = ? ORDER BY ts DESC LIMIT 1`)
    .get(ticker.toUpperCase().trim()) as Record<string, unknown> | undefined;
  return row ? rowToRun(row) : null;
}

export interface RunSummary {
  id: number;
  ticker: string;
  ts: number;
  status: string;
  stance: string;
  score: number;
  confidence: string;
}

export function recentRuns(limit = 40): RunSummary[] {
  const rows = researchDb()
    .prepare(
      `SELECT id, ticker, ts, status, consensus_json, thesis_json FROM research_runs ORDER BY ts DESC LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map((r) => {
    const c = JSON.parse(String(r.consensus_json)) as ConsensusResult;
    return {
      id: Number(r.id),
      ticker: String(r.ticker),
      ts: Number(r.ts),
      status: String(r.status),
      stance: c.stance,
      score: c.score,
      confidence: (JSON.parse(String(r.thesis_json)) as Thesis).confidence.level,
    };
  });
}

export interface ThesisHistoryPoint {
  id: number;
  runId: number;
  ts: number;
  stance: string;
  summary: string;
}

export function thesisHistory(ticker: string, limit = 50): ThesisHistoryPoint[] {
  const rows = researchDb()
    .prepare(`SELECT id, run_id, ts, stance, summary FROM theses WHERE ticker = ? ORDER BY ts DESC LIMIT ?`)
    .all(ticker.toUpperCase().trim(), limit) as Record<string, unknown>[];
  return rows.reverse().map((r) => ({
    id: Number(r.id),
    runId: Number(r.run_id),
    ts: Number(r.ts),
    stance: String(r.stance),
    summary: String(r.summary),
  }));
}

// ── Forecast audit (§22) — evaluate every forecast, no cherry-picking ──

export function pendingForecasts(): StoredForecast[] {
  const rows = researchDb()
    .prepare(`SELECT * FROM forecasts WHERE status = 'pending' AND ts + horizon_days * 86400000 <= ?`)
    .all(Date.now()) as Record<string, unknown>[];
  return rows.map(rowToForecast);
}

export function resolveForecast(id: number, priceNow: number): boolean {
  const f = researchDb()
    .prepare(`SELECT * FROM forecasts WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!f) return false;
  const entry = rowToForecast(f);
  const actualMovePct = entry.priceAtForecast ? (priceNow / entry.priceAtForecast - 1) * 100 : null;
  if (actualMovePct == null) return false;
  const wentUp = actualMovePct > 0;
  const correct = (entry.direction === "up" && wentUp) || (entry.direction === "down" && !wentUp) ? 1 : 0;
  researchDb()
    .prepare(`UPDATE forecasts SET status = 'resolved', resolved_ts = ?, actual_move_pct = ?, correct = ? WHERE id = ?`)
    .run(Date.now(), Math.round(actualMovePct * 100) / 100, correct, id);
  return true;
}

function rowToForecast(r: Record<string, unknown>): StoredForecast {
  return {
    id: Number(r.id),
    runId: Number(r.run_id),
    ticker: String(r.ticker),
    ts: Number(r.ts),
    horizonDays: Number(r.horizon_days),
    direction: r.direction as "up" | "down",
    expectedMovePct: r.expected_move_pct == null ? null : Number(r.expected_move_pct),
    priceAtForecast: Number(r.price_at_forecast),
    status: r.status as StoredForecast["status"],
    resolvedTs: r.resolved_ts == null ? null : Number(r.resolved_ts),
    actualMovePct: r.actual_move_pct == null ? null : Number(r.actual_move_pct),
    correct: r.correct == null ? null : Number(r.correct),
  };
}

export interface ForecastAudit {
  total: number;
  resolved: number;
  pending: number;
  directionalAccuracy: number | null;
  byTicker: { ticker: string; resolved: number; correct: number }[];
}

export function forecastAudit(): ForecastAudit {
  const all = researchDb()
    .prepare(`SELECT * FROM forecasts ORDER BY ts DESC LIMIT 500`)
    .all() as Record<string, unknown>[];
  const forecasts = all.map(rowToForecast);
  const resolved = forecasts.filter((f) => f.status === "resolved");
  const correct = resolved.filter((f) => f.correct === 1).length;
  const byTickerMap = new Map<string, { resolved: number; correct: number }>();
  for (const f of resolved) {
    const cur = byTickerMap.get(f.ticker) ?? { resolved: 0, correct: 0 };
    cur.resolved += 1;
    cur.correct += f.correct === 1 ? 1 : 0;
    byTickerMap.set(f.ticker, cur);
  }
  return {
    total: forecasts.length,
    resolved: resolved.length,
    pending: forecasts.filter((f) => f.status === "pending").length,
    directionalAccuracy: resolved.length ? correct / resolved.length : null,
    byTicker: [...byTickerMap.entries()].map(([ticker, v]) => ({ ticker, ...v })).sort((a, b) => b.resolved - a.resolved),
  };
}

// ── Watchlist ─────────────────────────────────────────────────────────

export function watchlistTickers(): { ticker: string; addedTs: number; note: string | null }[] {
  const rows = researchDb()
    .prepare(`SELECT ticker, added_ts, note FROM watchlist ORDER BY added_ts DESC`)
    .all() as { ticker: string; added_ts: number; note: string | null }[];
  return rows.map((r) => ({ ticker: r.ticker, addedTs: Number(r.added_ts), note: r.note }));
}

export function watchlistAdd(ticker: string, note?: string): void {
  researchDb()
    .prepare(`INSERT INTO watchlist (ticker, added_ts, note) VALUES (?, ?, ?) ON CONFLICT(ticker) DO UPDATE SET note = excluded.note`)
    .run(ticker.toUpperCase().trim(), Date.now(), note ?? null);
}

export function watchlistRemove(ticker: string): void {
  researchDb().prepare(`DELETE FROM watchlist WHERE ticker = ?`).run(ticker.toUpperCase().trim());
}
