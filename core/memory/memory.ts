// TruffleTrade Memory — the local, on-device memory system.
// Episodic + semantic facts extracted from research runs and market context,
// consolidated on a schedule, exportable as a privacy-preserving batch
// for federated learning across installations.

import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import pathMod from "node:path";

export interface MemoryFact {
  id: number;
  kind: "market_regime" | "prediction" | "outcome" | "analyst_insight" | "risk_event";
  subject: string; // ticker or macro symbol
  content: string;
  confidence: number; // 0..1
  createdAt: number;
  lastReinforcedAt: number;
  reinforcementCount: number;
  source: string; // "twin:<model>" | "research:<runId>" | "consolidation" | "user"
  embedding: number[]; // lightweight lexical vector, always present
}

export interface MemorySearchResult {
  fact: MemoryFact;
  score: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tt_memory_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  created_at INTEGER NOT NULL,
  last_reinforced_at INTEGER NOT NULL,
  reinforcement_count INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  embedding TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_subject ON tt_memory_facts(subject, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_kind ON tt_memory_facts(kind);
CREATE TABLE IF NOT EXISTS tt_memory_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","for","with","at","by","from","up","down","is","are","was","were","be","been","it","its","this","that","these","those","as","than","then","so","if","into","over","under","out","no","not","nor","only","own","same","such","can","will","just","should","now",
]);

/** Lightweight lexical embedding: 96-dim hashed bag-of-words, L2-normalized. Deterministic, dependency-free. */
export function lexicalEmbed(text: string, dim = 96): number[] {
  const v = new Array(dim).fill(0);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s.+-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) {
      h ^= w.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    v[(h >>> 0) % dim] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

export interface RegimeSnapshot {
  realizedVolPct?: number;
  trendPct?: number; // 20d return
  drawdownPct?: number;
  atrPct?: number;
}

export function classifyRegime(s: RegimeSnapshot): "calm-uptrend" | "calm-downtrend" | "volatile-uptrend" | "volatile-downtrend" | "high-vol" | "calm" {
  const vol = s.realizedVolPct ?? s.atrPct ?? 0;
  const hiVol = vol > 3.0;
  const trend = s.trendPct ?? 0;
  if (hiVol && trend > 2) return "volatile-uptrend";
  if (hiVol && trend < -2) return "volatile-downtrend";
  if (hiVol) return "high-vol";
  if (trend > 2) return "calm-uptrend";
  if (trend < -2) return "calm-downtrend";
  return "calm";
}

/** Approximate market snapshot for a named regime — used when replaying twins. */
export function regimeFromLabel(label: string): RegimeSnapshot {
  switch (label) {
    case "calm-uptrend": return { realizedVolPct: 1.0, trendPct: 5 };
    case "calm-downtrend": return { realizedVolPct: 1.0, trendPct: -5 };
    case "volatile-uptrend": return { realizedVolPct: 4.0, trendPct: 6 };
    case "volatile-downtrend": return { realizedVolPct: 4.0, trendPct: -6 };
    case "high-vol": return { realizedVolPct: 5.0, trendPct: 0 };
    default: return { realizedVolPct: 1.0, trendPct: 0 };
  }
}

let cached: Database.Database | null = null;

function db(): Database.Database {
  if (cached) return cached;
  const file = process.env.MEMORY_DB_PATH?.trim() || pathMod.resolve(process.cwd(), "data/memory.sqlite3");
  const dir = pathMod.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const d = new Database(file);
  d.pragma("journal_mode = WAL");
  d.exec(SCHEMA);
  cached = d;
  return d;
}

function insertFact(
  d: Database.Database,
  kind: MemoryFact["kind"],
  subject: string,
  content: string,
  confidence: number,
  ts: number,
  source: string,
): void {
  const trimmed = content.trim().slice(0, 500);
  if (!trimmed) return;
  d.prepare(
    `INSERT INTO tt_memory_facts (kind, subject, content, confidence, created_at, last_reinforced_at, reinforcement_count, source, embedding)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(kind, subject.toUpperCase(), trimmed, confidence, ts, ts, source, JSON.stringify(lexicalEmbed(trimmed)));
}

export interface IngestPredictionInput {
  ticker: string;
  stance: string;
  direction: "up" | "down";
  expectedMovePct: number | null;
  horizonDays: number;
  priceAtPrediction: number;
  priceNow: number;
  ts: number;
  source?: string;
}

/** Store a prediction + its resolution as memory facts (called when a forecast matures). */
export function recordPredictionOutcome(input: IngestPredictionInput): void {
  const d = db();
  const movedPct = (input.priceNow / input.priceAtPrediction - 1) * 100;
  const correct = (input.direction === "up" && movedPct > 0) || (input.direction === "down" && movedPct <= 0);
  const pred = `predicted ${input.direction} ${input.expectedMovePct ?? "?"}% over ${input.horizonDays}d from ${input.priceAtPrediction}`;
  const outcome = `resolved ${correct ? "correct" : "incorrect"}: moved ${movedPct.toFixed(2)}% to ${input.priceNow}`;
  const source = input.source ?? "research";
  insertFact(d, "prediction", input.ticker, pred, 0.5, input.ts, source);
  insertFact(d, "outcome", input.ticker, outcome, 0.9, input.ts, source);
}

export interface IngestRunFactsInput {
  ticker: string;
  runId: number | null;
  consensus: { stance: string; score: number } | null;
  thesisSummary: string | null;
  redTeamObjections: string[];
  facts: string[];
  ts: number;
}

/** Ingest analyst insights from a completed research run. */
export function ingestRunFacts(input: IngestRunFactsInput): void {
  const d = db();
  const source = input.runId ? `research:${input.runId}` : "research";
  const tx = d.transaction(() => {
    for (const f of input.facts.slice(0, 20)) {
      insertFact(d, "analyst_insight", input.ticker, f, 0.55, input.ts, source);
    }
    if (input.thesisSummary) {
      const conf = Math.min(1, 0.6 + Math.abs(input.consensus?.score ?? 0) / 10);
      insertFact(d, "analyst_insight", input.ticker, `thesis: ${input.thesisSummary}`, conf, input.ts, source);
    }
    for (const o of input.redTeamObjections.slice(0, 6)) {
      insertFact(d, "risk_event", input.ticker, `red team: ${o}`, 0.7, input.ts, source);
    }
  });
  tx();
}

/** Record a market-regime observation (from live data or a twin simulation). */
export function recordRegime(subject: string, regime: string, volPct: number, trendPct: number, ts: number, source: string): void {
  const d = db();
  const content = `${regime}: vol ${volPct.toFixed(2)}% trend ${trendPct.toFixed(2)}%`;
  insertFact(d, "market_regime", subject, content, 0.8, ts, source);
}

export interface RecallInput {
  subjects?: string[];
  query?: string;
  kinds?: MemoryFact["kind"][];
  limit?: number;
  minConfidence?: number;
  maxAgeDays?: number;
}

export function recall(input: RecallInput = {}): MemorySearchResult[] {
  const d = db();
  const limit = input.limit ?? 12;
  const minConf = input.minConfidence ?? 0.3;
  const maxAge = input.maxAgeDays ? Date.now() - input.maxAgeDays * 86_400_000 : 0;
  const subjects = (input.subjects ?? []).map((s) => s.toUpperCase());
  const qEmb = input.query ? lexicalEmbed(input.query) : null;

  const rows = d
    .prepare(
      `SELECT * FROM tt_memory_facts
       WHERE confidence >= ?
         AND created_at >= ?
         ${subjects.length ? `AND subject IN (${subjects.map(() => "?").join(",")})` : ""}
         ${input.kinds?.length ? `AND kind IN (${input.kinds.map(() => "?").join(",")})` : ""}
       ORDER BY created_at DESC LIMIT 400`,
    )
    .all(minConf, maxAge, ...subjects, ...(input.kinds ?? [])) as Record<string, unknown>[];

  const now = Date.now();
  const results = rows.map((r) => {
    const fact = rowToFact(r);
    const ageDays = Math.max(0, (now - fact.createdAt) / 86_400_000);
    const recency = Math.exp(-ageDays / 21);
    let score = 0.25 * fact.confidence + 0.2 * Math.min(1, fact.reinforcementCount / 5) + 0.25 * recency;
    if (qEmb) score += 0.3 * cosine(qEmb, fact.embedding);
    return { fact, score };
  });
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function rowToFact(r: Record<string, unknown>): MemoryFact {
  return {
    id: Number(r.id),
    kind: r.kind as MemoryFact["kind"],
    subject: String(r.subject),
    content: String(r.content),
    confidence: Number(r.confidence),
    createdAt: Number(r.created_at),
    lastReinforcedAt: Number(r.last_reinforced_at),
    reinforcementCount: Number(r.reinforcement_count),
    source: String(r.source),
    embedding: JSON.parse(String(r.embedding)) as number[],
  };
}

/** Insert with semantic de-duplication: reinforce an existing near-identical fact instead of duplicating. */
export function reinforceSimilar(
  fact: { kind: MemoryFact["kind"]; subject: string; content: string; confidence: number; createdAt: number; source: string },
  similarityThreshold = 0.92,
): void {
  const d = db();
  const embedding = lexicalEmbed(fact.content);
  const rows = d
    .prepare(`SELECT * FROM tt_memory_facts WHERE subject = ? AND kind = ? ORDER BY created_at DESC LIMIT 50`)
    .all(fact.subject.toUpperCase(), fact.kind) as Record<string, unknown>[];
  for (const r of rows) {
    const existing = rowToFact(r);
    if (cosine(existing.embedding, embedding) >= similarityThreshold) {
      d.prepare(
        `UPDATE tt_memory_facts SET reinforcement_count = reinforcement_count + 1, last_reinforced_at = ?, confidence = MIN(1.0, confidence + 0.05) WHERE id = ?`,
      ).run(Date.now(), existing.id);
      return;
    }
  }
  d.prepare(
    `INSERT INTO tt_memory_facts (kind, subject, content, confidence, created_at, last_reinforced_at, reinforcement_count, source, embedding)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(fact.kind, fact.subject.toUpperCase(), fact.content.slice(0, 500), fact.confidence, fact.createdAt, fact.createdAt, fact.source, JSON.stringify(embedding));
}

export interface MemoryStats {
  totalFacts: number;
  byKind: Record<string, number>;
  oldestFactTs: number | null;
  newestFactTs: number | null;
  lastAutoUpdateTs: number | null;
}

export function memoryStats(): MemoryStats {
  const d = db();
  const total = (d.prepare(`SELECT COUNT(*) AS n FROM tt_memory_facts`).get() as { n: number }).n;
  const byKindRows = d.prepare(`SELECT kind, COUNT(*) AS n FROM tt_memory_facts GROUP BY kind`).all() as { kind: string; n: number }[];
  const bounds = d.prepare(`SELECT MIN(created_at) AS lo, MAX(created_at) AS hi FROM tt_memory_facts`).get() as { lo: number | null; hi: number | null };
  return {
    totalFacts: Number(total),
    byKind: Object.fromEntries(byKindRows.map((r) => [r.kind, Number(r.n)])),
    oldestFactTs: bounds.lo == null ? null : Number(bounds.lo),
    newestFactTs: bounds.hi == null ? null : Number(bounds.hi),
    lastAutoUpdateTs: getLastAutoUpdateTs() || null,
  };
}

export interface FederatedBatch {
  epoch: number;
  tokens: number;
  batches: { subjectHash: string; kindCounts: Record<string, number> }[];
}

/**
 * Export facts newer than `sinceTs` as a privacy-preserving federated-learning
 * batch: subject tickers are hashed, contents never leave the device — only
 * per-subject counts of fact kinds. No raw content, no positions, no identity.
 */
export function exportFederatedBatch(sinceTs: number): FederatedBatch {
  const d = db();
  const rows = d.prepare(`SELECT subject, kind FROM tt_memory_facts WHERE created_at > ?`).all(sinceTs) as { subject: string; kind: string }[];
  const map = new Map<string, Record<string, number>>();
  let tokens = 0;
  for (const r of rows) {
    const subjectHash = sha256Short(r.subject);
    const m = map.get(subjectHash) ?? {};
    m[r.kind] = (m[r.kind] ?? 0) + 1;
    map.set(subjectHash, m);
    tokens += 1;
  }
  return {
    epoch: Math.floor(Date.now() / 86_400_000),
    tokens,
    batches: [...map.entries()].map(([subjectHash, kindCounts]) => ({ subjectHash, kindCounts })),
  };
}

function sha256Short(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export function setLastAutoUpdateTs(ts: number): void {
  db()
    .prepare(`INSERT INTO tt_memory_state (key, value) VALUES ('last_auto_update', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(String(ts));
}

export function getLastAutoUpdateTs(): number {
  const r = db().prepare(`SELECT value FROM tt_memory_state WHERE key = 'last_auto_update'`).get() as { value: string } | undefined;
  return r ? Number(r.value) : 0;
}

/** Consolidation: de-duplicate near-identical facts, decay stale confidence. */
export function consolidate(now = Date.now()): { merged: number } {
  const d = db();
  const rows = d.prepare(`SELECT * FROM tt_memory_facts ORDER BY subject, kind, created_at DESC LIMIT 2000`).all() as Record<string, unknown>[];
  const kept: MemoryFact[] = [];
  let merged = 0;
  for (const r of rows) {
    const f = rowToFact(r);
    const twin = kept.find((k) => k.subject === f.subject && k.kind === f.kind && cosine(k.embedding, f.embedding) >= 0.95);
    if (twin) {
      d.prepare(
        `UPDATE tt_memory_facts SET reinforcement_count = reinforcement_count + 1, last_reinforced_at = ?, confidence = MIN(1.0, confidence + 0.05) WHERE id = ?`,
      ).run(now, twin.id);
      d.prepare(`DELETE FROM tt_memory_facts WHERE id = ?`).run(f.id);
      merged += 1;
    } else {
      kept.push(f);
    }
  }
  d.prepare(`UPDATE tt_memory_facts SET confidence = MAX(0.3, confidence * 0.99) WHERE created_at < ? AND confidence > 0.31`).run(now - 60 * 86_400_000);
  return { merged };
}

/** The auto-update entry point — consolidation + bookkeeping. Called by the scheduler/CLI. */
export function runMemoryUpdate(): { merged: number; stats: MemoryStats } {
  const { merged } = consolidate();
  setLastAutoUpdateTs(Date.now());
  return { merged, stats: memoryStats() };
}
