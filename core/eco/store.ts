// Black/White Truffle ecosystem persistence — personal market intelligence data.
//
// Follows the exact dual-backend pattern of core/licensing/db.ts:
//   - SQLite (default) for local dev and the desktop app
//   - Postgres/Neon (when DATABASE_URL is set) for the Vercel production gateway
// Same schema and method surface on both — routes never care which is active.
//
// Every row is scoped to user_id = the subscriber's access-code HASH (never the
// plaintext code), matching how licensing identifies users. The AI layer uses
// the same key, so Black Truffle can only ever see the calling user's data.
//
// Tables (per the ecosystem spec):
//   eco_theses          user-created investment theses (asset/claim/evidence/...)
//   eco_thesis_events   append-only thesis updates (status changes, AI checks)
//   eco_journal         decision journal entries
//   eco_outcomes        what actually happened for a journal entry
//   eco_notes           research notes (freeform, AI-summarizable)
//   eco_lessons         learning progress (completed lessons, quiz scores)
//   eco_prefs           durable AI-facing user preferences
//   eco_conversations   Black Truffle conversation summaries (compact, retrieved)

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { pgQuery } from "../pg";

/** Matches the licensing store's dual-backend contract (sync SQLite | async Postgres). */
export type Awaitable<T> = T | Promise<T>;

// ── schema ────────────────────────────────────────────────────────────────

const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS eco_theses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  claim TEXT NOT NULL,
  time_horizon TEXT,
  supporting_evidence_json TEXT NOT NULL DEFAULT '[]',
  counterarguments_json TEXT NOT NULL DEFAULT '[]',
  key_risks_json TEXT NOT NULL DEFAULT '[]',
  invalidation_conditions_json TEXT NOT NULL DEFAULT '[]',
  confidence INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eco_theses_user ON eco_theses(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_eco_theses_asset ON eco_theses(user_id, asset);

CREATE TABLE IF NOT EXISTS eco_thesis_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  thesis_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_eco_thesis_events ON eco_thesis_events(user_id, thesis_id, ts DESC);

CREATE TABLE IF NOT EXISTS eco_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  asset TEXT,
  belief TEXT NOT NULL,
  reasoning TEXT,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  expectation TEXT,
  invalidation TEXT
);
CREATE INDEX IF NOT EXISTS idx_eco_journal_user ON eco_journal(user_id, ts DESC);

CREATE TABLE IF NOT EXISTS eco_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  journal_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  what_happened TEXT NOT NULL,
  differed TEXT
);
CREATE INDEX IF NOT EXISTS idx_eco_outcomes_journal ON eco_outcomes(user_id, journal_id);

CREATE TABLE IF NOT EXISTS eco_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_eco_notes_user ON eco_notes(user_id, ts DESC);

CREATE TABLE IF NOT EXISTS eco_lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  lesson TEXT NOT NULL,
  quiz_score INTEGER,
  completed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eco_lessons_user ON eco_lessons(user_id, topic, completed_at DESC);

CREATE TABLE IF NOT EXISTS eco_prefs (
  key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS eco_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  summary TEXT NOT NULL,
  topic TEXT
);
CREATE INDEX IF NOT EXISTS idx_eco_conv_user ON eco_conversations(user_id, ts DESC);
`;

const SCHEMA_PG = `
CREATE TABLE IF NOT EXISTS eco_theses (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  claim TEXT NOT NULL,
  time_horizon TEXT,
  supporting_evidence_json JSONB NOT NULL DEFAULT '[]',
  counterarguments_json JSONB NOT NULL DEFAULT '[]',
  key_risks_json JSONB NOT NULL DEFAULT '[]',
  invalidation_conditions_json JSONB NOT NULL DEFAULT '[]',
  confidence INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eco_theses_user ON eco_theses(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_eco_theses_asset ON eco_theses(user_id, asset);

CREATE TABLE IF NOT EXISTS eco_thesis_events (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  thesis_id BIGINT NOT NULL,
  ts BIGINT NOT NULL,
  kind TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_eco_thesis_events ON eco_thesis_events(user_id, thesis_id, ts DESC);

CREATE TABLE IF NOT EXISTS eco_journal (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  ts BIGINT NOT NULL,
  asset TEXT,
  belief TEXT NOT NULL,
  reasoning TEXT,
  evidence_json JSONB NOT NULL DEFAULT '[]',
  expectation TEXT,
  invalidation TEXT
);
CREATE INDEX IF NOT EXISTS idx_eco_journal_user ON eco_journal(user_id, ts DESC);

CREATE TABLE IF NOT EXISTS eco_outcomes (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  journal_id BIGINT NOT NULL,
  ts BIGINT NOT NULL,
  what_happened TEXT NOT NULL,
  differed TEXT
);
CREATE INDEX IF NOT EXISTS idx_eco_outcomes_journal ON eco_outcomes(user_id, journal_id);

CREATE TABLE IF NOT EXISTS eco_notes (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  ts BIGINT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags_json JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_eco_notes_user ON eco_notes(user_id, ts DESC);

CREATE TABLE IF NOT EXISTS eco_lessons (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  lesson TEXT NOT NULL,
  quiz_score INTEGER,
  completed_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eco_lessons_user ON eco_lessons(user_id, topic, completed_at DESC);

CREATE TABLE IF NOT EXISTS eco_prefs (
  key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS eco_conversations (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  ts BIGINT NOT NULL,
  summary TEXT NOT NULL,
  topic TEXT
);
CREATE INDEX IF NOT EXISTS idx_eco_conv_user ON eco_conversations(user_id, ts DESC);
`;

let pgSchemaReady: Promise<void> | null = null;
function ensurePgSchema(): Promise<void> {
  pgSchemaReady ??= pgQuery(SCHEMA_PG).then(() => undefined);
  return pgSchemaReady;
}

function sqliteDb(): Database.Database {
  if (cachedSqlite) return cachedSqlite;
  const file = process.env.SQLITE_PATH?.trim() || "data/truffletrade.sqlite3";
  const resolved = path.isAbsolute(file) ? file : path.join(process.cwd(), "data", path.basename(file));
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQLITE);
  cachedSqlite = db;
  return db;
}

let cachedSqlite: Database.Database | null = null;

export function dbKind(): "sqlite" | "postgres" {
  return process.env.DATABASE_URL?.trim() ? "postgres" : "sqlite";
}

/** JSONB columns arrive as strings (SQLite) or parsed objects (pg) — normalize. */
function jsonbText(v: unknown): string {
  if (v == null) return "[]";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function jsonArr(v: unknown): string[] {
  try {
    const parsed = JSON.parse(jsonbText(v));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// ── types ─────────────────────────────────────────────────────────────────

export interface EcoThesis {
  id: number;
  asset: string;
  claim: string;
  timeHorizon: string | null;
  supportingEvidence: string[];
  counterarguments: string[];
  keyRisks: string[];
  invalidationConditions: string[];
  confidence: number | null;
  status: "active" | "validated" | "invalidated" | "retired";
  createdAt: number;
  updatedAt: number;
}

export interface JournalEntry {
  id: number;
  ts: number;
  asset: string | null;
  belief: string;
  reasoning: string | null;
  evidence: string[];
  expectation: string | null;
  invalidation: string | null;
  outcome?: { whatHappened: string; differed: string | null; ts: number } | null;
}

export interface ResearchNote {
  id: number;
  ts: number;
  title: string;
  body: string;
  tags: string[];
}

export interface LessonRecord {
  topic: string;
  lesson: string;
  quizScore: number | null;
  completedAt: number;
}

const THESIS_STATUSES = ["active", "validated", "invalidated", "retired"] as const;

// ── backend interface ─────────────────────────────────────────────────────

export interface EcoDb {
  // theses
  createThesis(userId: string, t: Omit<EcoThesis, "id" | "createdAt" | "updatedAt">): Awaitable<number>;
  listTheses(userId: string, opts?: { asset?: string; status?: string; limit?: number }): Awaitable<EcoThesis[]>;
  getThesis(userId: string, id: number): Awaitable<EcoThesis | null>;
  updateThesis(userId: string, id: number, patch: Partial<Omit<EcoThesis, "id" | "createdAt">>): Awaitable<boolean>;
  recordThesisEvent(userId: string, thesisId: number, kind: string, note?: string): Awaitable<void>;
  thesisEvents(userId: string, thesisId: number, limit?: number): Awaitable<{ ts: number; kind: string; note: string | null }[]>;
  // journal
  createJournalEntry(userId: string, e: Omit<JournalEntry, "id" | "ts" | "outcome">): Awaitable<number>;
  listJournal(userId: string, opts?: { asset?: string; limit?: number }): Awaitable<JournalEntry[]>;
  addOutcome(userId: string, journalId: number, whatHappened: string, differed?: string): Awaitable<boolean>;
  // notes
  createNote(userId: string, n: Omit<ResearchNote, "id" | "ts">): Awaitable<number>;
  listNotes(userId: string, limit?: number): Awaitable<ResearchNote[]>;
  // learning
  recordLesson(userId: string, l: LessonRecord): Awaitable<void>;
  lessonProgress(userId: string): Awaitable<{ topic: string; attempts: number; bestScore: number | null; lastAt: number }[]>;
  // prefs
  setPref(userId: string, key: string, value: string): Awaitable<void>;
  getPrefs(userId: string): Awaitable<Record<string, string>>;
  // conversations
  saveConversationSummary(userId: string, summary: string, topic?: string): Awaitable<void>;
  recentConversations(userId: string, limit?: number): Awaitable<{ ts: number; summary: string; topic: string | null }[]>;
}

// ── shared row mapping ────────────────────────────────────────────────────

function thesisFromRow(r: Record<string, unknown>): EcoThesis {
  return {
    id: Number(r.id),
    asset: String(r.asset),
    claim: String(r.claim),
    timeHorizon: r.time_horizon == null ? null : String(r.time_horizon),
    supportingEvidence: jsonArr(r.supporting_evidence_json),
    counterarguments: jsonArr(r.counterarguments_json),
    keyRisks: jsonArr(r.key_risks_json),
    invalidationConditions: jsonArr(r.invalidation_conditions_json),
    confidence: r.confidence == null ? null : Number(r.confidence),
    status: String(r.status) as EcoThesis["status"],
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function journalFromRow(r: Record<string, unknown>, outcome?: JournalEntry["outcome"]): JournalEntry {
  return {
    id: Number(r.id),
    ts: Number(r.ts),
    asset: r.asset == null ? null : String(r.asset),
    belief: String(r.belief),
    reasoning: r.reasoning == null ? null : String(r.reasoning),
    evidence: jsonArr(r.evidence_json),
    expectation: r.expectation == null ? null : String(r.expectation),
    invalidation: r.invalidation == null ? null : String(r.invalidation),
    outcome: outcome ?? null,
  };
}

/** Shared INSERT helpers so both backends stay in lockstep. */
function thesisParams(t: Omit<EcoThesis, "id" | "createdAt" | "updatedAt">, now: number): unknown[] {
  return [
    t.asset.toUpperCase().trim(),
    t.claim.trim(),
    t.timeHorizon ?? null,
    JSON.stringify(t.supportingEvidence ?? []),
    JSON.stringify(t.counterarguments ?? []),
    JSON.stringify(t.keyRisks ?? []),
    JSON.stringify(t.invalidationConditions ?? []),
    t.confidence ?? null,
    t.status ?? "active",
    now,
    now,
  ];
}

const THESIS_COLS = `(user_id, asset, claim, time_horizon, supporting_evidence_json, counterarguments_json, key_risks_json, invalidation_conditions_json, confidence, status, created_at, updated_at)`;

// ── SQLite backend ────────────────────────────────────────────────────────

class SqliteEcoDb implements EcoDb {
  createThesis(userId: string, t: Omit<EcoThesis, "id" | "createdAt" | "updatedAt">): number {
    const now = Date.now();
    const r = sqliteDb()
      .prepare(`INSERT INTO eco_theses ${THESIS_COLS} VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, ...thesisParams(t, now));
    return Number(r.lastInsertRowid);
  }

  listTheses(userId: string, opts: { asset?: string; status?: string; limit?: number } = {}): EcoThesis[] {
    const clauses = ["user_id = ?"];
    const params: unknown[] = [userId];
    if (opts.asset) { clauses.push("asset = ?"); params.push(opts.asset.toUpperCase().trim()); }
    if (opts.status) { clauses.push("status = ?"); params.push(opts.status); }
    params.push(Math.min(opts.limit ?? 100, 200));
    const rows = sqliteDb()
      .prepare(`SELECT * FROM eco_theses WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`)
      .all(...params) as Record<string, unknown>[];
    return rows.map(thesisFromRow);
  }

  getThesis(userId: string, id: number): EcoThesis | null {
    const row = sqliteDb()
      .prepare(`SELECT * FROM eco_theses WHERE user_id = ? AND id = ?`)
      .get(userId, id) as Record<string, unknown> | undefined;
    return row ? thesisFromRow(row) : null;
  }

  updateThesis(userId: string, id: number, patch: Partial<Omit<EcoThesis, "id" | "createdAt">>): boolean {
    const cur = this.getThesis(userId, id);
    if (!cur) return false;
    const next = { ...cur, ...patch };
    sqliteDb()
      .prepare(
        `UPDATE eco_theses SET asset=?, claim=?, time_horizon=?, supporting_evidence_json=?, counterarguments_json=?, key_risks_json=?, invalidation_conditions_json=?, confidence=?, status=?, updated_at=? WHERE user_id=? AND id=?`,
      )
      .run(
        next.asset.toUpperCase().trim(),
        next.claim,
        next.timeHorizon,
        JSON.stringify(next.supportingEvidence),
        JSON.stringify(next.counterarguments),
        JSON.stringify(next.keyRisks),
        JSON.stringify(next.invalidationConditions),
        next.confidence,
        next.status,
        Date.now(),
        userId,
        id,
      );
    return true;
  }

  recordThesisEvent(userId: string, thesisId: number, kind: string, note?: string): void {
    sqliteDb()
      .prepare(`INSERT INTO eco_thesis_events (user_id, thesis_id, ts, kind, note) VALUES (?,?,?,?,?)`)
      .run(userId, thesisId, Date.now(), kind.slice(0, 40), note?.slice(0, 2000) ?? null);
  }

  thesisEvents(userId: string, thesisId: number, limit = 20): { ts: number; kind: string; note: string | null }[] {
    return (
      sqliteDb()
        .prepare(`SELECT ts, kind, note FROM eco_thesis_events WHERE user_id=? AND thesis_id=? ORDER BY ts DESC LIMIT ?`)
        .all(userId, thesisId, limit) as { ts: number; kind: string; note: string | null }[]
    ).map((r) => ({ ts: Number(r.ts), kind: String(r.kind), note: r.note == null ? null : String(r.note) }));
  }

  createJournalEntry(userId: string, e: Omit<JournalEntry, "id" | "ts" | "outcome">): number {
    const r = sqliteDb()
      .prepare(`INSERT INTO eco_journal (user_id, ts, asset, belief, reasoning, evidence_json, expectation, invalidation) VALUES (?,?,?,?,?,?,?,?)`)
      .run(userId, Date.now(), e.asset?.toUpperCase().trim() ?? null, e.belief.trim(), e.reasoning, JSON.stringify(e.evidence ?? []), e.expectation, e.invalidation);
    return Number(r.lastInsertRowid);
  }

  listJournal(userId: string, opts: { asset?: string; limit?: number } = {}): JournalEntry[] {
    const clauses = ["user_id = ?"];
    const params: unknown[] = [userId];
    if (opts.asset) { clauses.push("asset = ?"); params.push(opts.asset.toUpperCase().trim()); }
    params.push(Math.min(opts.limit ?? 50, 200));
    const rows = sqliteDb()
      .prepare(`SELECT * FROM eco_journal WHERE ${clauses.join(" AND ")} ORDER BY ts DESC LIMIT ?`)
      .all(...params) as Record<string, unknown>[];
    const outcomeStmt = sqliteDb().prepare(`SELECT what_happened, differed, ts FROM eco_outcomes WHERE user_id=? AND journal_id=? ORDER BY ts DESC LIMIT 1`);
    return rows.map((r) => {
      const o = outcomeStmt.get(userId, Number(r.id)) as Record<string, unknown> | undefined;
      return journalFromRow(
        r,
        o ? { whatHappened: String(o.what_happened), differed: o.differed == null ? null : String(o.differed), ts: Number(o.ts) } : null,
      );
    });
  }

  addOutcome(userId: string, journalId: number, whatHappened: string, differed?: string): boolean {
    const owned = sqliteDb().prepare(`SELECT id FROM eco_journal WHERE user_id=? AND id=?`).get(userId, journalId);
    if (!owned) return false;
    sqliteDb()
      .prepare(`INSERT INTO eco_outcomes (user_id, journal_id, ts, what_happened, differed) VALUES (?,?,?,?,?)`)
      .run(userId, journalId, Date.now(), whatHappened.trim(), differed ?? null);
    return true;
  }

  createNote(userId: string, n: Omit<ResearchNote, "id" | "ts">): number {
    const r = sqliteDb()
      .prepare(`INSERT INTO eco_notes (user_id, ts, title, body, tags_json) VALUES (?,?,?,?,?)`)
      .run(userId, Date.now(), n.title.trim().slice(0, 200), n.body.trim(), JSON.stringify(n.tags ?? []));
    return Number(r.lastInsertRowid);
  }

  listNotes(userId: string, limit = 50): ResearchNote[] {
    return (
      sqliteDb()
        .prepare(`SELECT id, ts, title, body, tags_json FROM eco_notes WHERE user_id=? ORDER BY ts DESC LIMIT ?`)
        .all(userId, Math.min(limit, 200)) as Record<string, unknown>[]
    ).map((r) => ({
      id: Number(r.id),
      ts: Number(r.ts),
      title: String(r.title),
      body: String(r.body),
      tags: jsonArr(r.tags_json),
    }));
  }

  recordLesson(userId: string, l: LessonRecord): void {
    sqliteDb()
      .prepare(`INSERT INTO eco_lessons (user_id, topic, lesson, quiz_score, completed_at) VALUES (?,?,?,?,?)`)
      .run(userId, l.topic.trim().slice(0, 60), l.lesson.trim(), l.quizScore ?? null, Date.now());
  }

  lessonProgress(userId: string): { topic: string; attempts: number; bestScore: number | null; lastAt: number }[] {
    const rows = sqliteDb()
      .prepare(`SELECT topic, COUNT(*) as attempts, MAX(quiz_score) as best, MAX(completed_at) as last FROM eco_lessons WHERE user_id=? GROUP BY topic ORDER BY last DESC`)
      .all(userId) as Record<string, unknown>[];
    return rows.map((r) => ({ topic: String(r.topic), attempts: Number(r.attempts), bestScore: r.best == null ? null : Number(r.best), lastAt: Number(r.last) }));
  }

  setPref(userId: string, key: string, value: string): void {
    sqliteDb()
      .prepare(`INSERT INTO eco_prefs (user_id, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
      .run(userId, key.slice(0, 60), value.slice(0, 2000), Date.now());
  }

  getPrefs(userId: string): Record<string, string> {
    const rows = sqliteDb().prepare(`SELECT key, value FROM eco_prefs WHERE user_id=?`).all(userId) as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  saveConversationSummary(userId: string, summary: string, topic?: string): void {
    sqliteDb()
      .prepare(`INSERT INTO eco_conversations (user_id, ts, summary, topic) VALUES (?,?,?,?)`)
      .run(userId, Date.now(), summary.trim().slice(0, 1000), topic?.slice(0, 60) ?? null);
  }

  recentConversations(userId: string, limit = 5): { ts: number; summary: string; topic: string | null }[] {
    return (
      sqliteDb()
        .prepare(`SELECT ts, summary, topic FROM eco_conversations WHERE user_id=? ORDER BY ts DESC LIMIT ?`)
        .all(userId, Math.min(limit, 20)) as Record<string, unknown>[]
    ).map((r) => ({ ts: Number(r.ts), summary: String(r.summary), topic: r.topic == null ? null : String(r.topic) }));
  }
}

// ── Postgres backend (Neon) ──────────────────────────────────────────────

class PostgresEcoDb implements EcoDb {
  private async q(sql: string, params: unknown[] = []) {
    await ensurePgSchema();
    return pgQuery(sql, params);
  }

  async createThesis(userId: string, t: Omit<EcoThesis, "id" | "createdAt" | "updatedAt">): Promise<number> {
    const now = Date.now();
    const rows = await this.q(`INSERT INTO eco_theses ${THESIS_COLS} VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [
      userId,
      ...thesisParams(t, now),
    ]);
    return Number(rows[0].id);
  }

  async listTheses(userId: string, opts: { asset?: string; status?: string; limit?: number } = {}): Promise<EcoThesis[]> {
    const clauses = ["user_id = $1"];
    const params: unknown[] = [userId];
    if (opts.asset) { clauses.push("asset = $" + (params.length + 1)); params.push(opts.asset.toUpperCase().trim()); }
    if (opts.status) { clauses.push("status = $" + (params.length + 1)); params.push(opts.status); }
    params.push(Math.min(opts.limit ?? 100, 200));
    const rows = await this.q(`SELECT * FROM eco_theses WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC LIMIT $${params.length}`, params);
    return rows.map(thesisFromRow);
  }

  async getThesis(userId: string, id: number): Promise<EcoThesis | null> {
    const rows = await this.q(`SELECT * FROM eco_theses WHERE user_id=$1 AND id=$2`, [userId, id]);
    return rows[0] ? thesisFromRow(rows[0]) : null;
  }

  async updateThesis(userId: string, id: number, patch: Partial<Omit<EcoThesis, "id" | "createdAt">>): Promise<boolean> {
    const cur = await this.getThesis(userId, id);
    if (!cur) return false;
    const next = { ...cur, ...patch };
    await this.q(
      `UPDATE eco_theses SET asset=$1, claim=$2, time_horizon=$3, supporting_evidence_json=$4, counterarguments_json=$5, key_risks_json=$6, invalidation_conditions_json=$7, confidence=$8, status=$9, updated_at=$10 WHERE user_id=$11 AND id=$12`,
      [
        next.asset.toUpperCase().trim(),
        next.claim,
        next.timeHorizon,
        JSON.stringify(next.supportingEvidence),
        JSON.stringify(next.counterarguments),
        JSON.stringify(next.keyRisks),
        JSON.stringify(next.invalidationConditions),
        next.confidence,
        next.status,
        Date.now(),
        userId,
        id,
      ],
    );
    return true;
  }

  async recordThesisEvent(userId: string, thesisId: number, kind: string, note?: string): Promise<void> {
    await this.q(`INSERT INTO eco_thesis_events (user_id, thesis_id, ts, kind, note) VALUES ($1,$2,$3,$4,$5)`, [
      userId, thesisId, Date.now(), kind.slice(0, 40), note?.slice(0, 2000) ?? null,
    ]);
  }

  async thesisEvents(userId: string, thesisId: number, limit = 20): Promise<{ ts: number; kind: string; note: string | null }[]> {
    const rows = await this.q(`SELECT ts, kind, note FROM eco_thesis_events WHERE user_id=$1 AND thesis_id=$2 ORDER BY ts DESC LIMIT $3`, [userId, thesisId, limit]);
    return rows.map((row) => ({ ts: Number(row.ts), kind: String(row.kind), note: row.note == null ? null : String(row.note) }));
  }

  async createJournalEntry(userId: string, e: Omit<JournalEntry, "id" | "ts" | "outcome">): Promise<number> {
    const rows = await this.q(
      `INSERT INTO eco_journal (user_id, ts, asset, belief, reasoning, evidence_json, expectation, invalidation) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [userId, Date.now(), e.asset?.toUpperCase().trim() ?? null, e.belief.trim(), e.reasoning, JSON.stringify(e.evidence ?? []), e.expectation, e.invalidation],
    );
    return Number(rows[0].id);
  }

  async listJournal(userId: string, opts: { asset?: string; limit?: number } = {}): Promise<JournalEntry[]> {
    const clauses = ["user_id = $1"];
    const params: unknown[] = [userId];
    if (opts.asset) { clauses.push("asset = $" + (params.length + 1)); params.push(opts.asset.toUpperCase().trim()); }
    params.push(Math.min(opts.limit ?? 50, 200));
    const rows = await this.q(`SELECT * FROM eco_journal WHERE ${clauses.join(" AND ")} ORDER BY ts DESC LIMIT $${params.length}`, params);
    const out: JournalEntry[] = [];
    for (const row of rows) {
      const o = await this.q(`SELECT what_happened, differed, ts FROM eco_outcomes WHERE user_id=$1 AND journal_id=$2 ORDER BY ts DESC LIMIT 1`, [userId, Number(row.id)]);
      out.push(journalFromRow(row, o[0] ? { whatHappened: String(o[0].what_happened), differed: o[0].differed == null ? null : String(o[0].differed), ts: Number(o[0].ts) } : null));
    }
    return out;
  }

  async addOutcome(userId: string, journalId: number, whatHappened: string, differed?: string): Promise<boolean> {
    const owned = await this.q(`SELECT id FROM eco_journal WHERE user_id=$1 AND id=$2`, [userId, journalId]);
    if (!owned[0]) return false;
    await this.q(`INSERT INTO eco_outcomes (user_id, journal_id, ts, what_happened, differed) VALUES ($1,$2,$3,$4,$5)`, [
      userId, journalId, Date.now(), whatHappened.trim(), differed ?? null,
    ]);
    return true;
  }

  async createNote(userId: string, n: Omit<ResearchNote, "id" | "ts">): Promise<number> {
    const rows = await this.q(`INSERT INTO eco_notes (user_id, ts, title, body, tags_json) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [
      userId, Date.now(), n.title.trim().slice(0, 200), n.body.trim(), JSON.stringify(n.tags ?? []),
    ]);
    return Number(rows[0].id);
  }

  async listNotes(userId: string, limit = 50): Promise<ResearchNote[]> {
    const rows = await this.q(`SELECT id, ts, title, body, tags_json FROM eco_notes WHERE user_id=$1 ORDER BY ts DESC LIMIT $2`, [userId, Math.min(limit, 200)]);
    return rows.map((row) => ({ id: Number(row.id), ts: Number(row.ts), title: String(row.title), body: String(row.body), tags: jsonArr(row.tags_json) }));
  }

  async recordLesson(userId: string, l: LessonRecord): Promise<void> {
    await this.q(`INSERT INTO eco_lessons (user_id, topic, lesson, quiz_score, completed_at) VALUES ($1,$2,$3,$4,$5)`, [
      userId, l.topic.trim().slice(0, 60), l.lesson.trim(), l.quizScore ?? null, Date.now(),
    ]);
  }

  async lessonProgress(userId: string): Promise<{ topic: string; attempts: number; bestScore: number | null; lastAt: number }[]> {
    const rows = await this.q(`SELECT topic, COUNT(*) as attempts, MAX(quiz_score) as best, MAX(completed_at) as last FROM eco_lessons WHERE user_id=$1 GROUP BY topic ORDER BY last DESC`, [userId]);
    return rows.map((row) => ({ topic: String(row.topic), attempts: Number(row.attempts), bestScore: row.best == null ? null : Number(row.best), lastAt: Number(row.last) }));
  }

  async setPref(userId: string, key: string, value: string): Promise<void> {
    await this.q(
      `INSERT INTO eco_prefs (user_id, key, value, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      [userId, key.slice(0, 60), value.slice(0, 2000), Date.now()],
    );
  }

  async getPrefs(userId: string): Promise<Record<string, string>> {
    const rows = await this.q(`SELECT key, value FROM eco_prefs WHERE user_id=$1`, [userId]);
    return Object.fromEntries(rows.map((row) => [String(row.key), String(row.value)]));
  }

  async saveConversationSummary(userId: string, summary: string, topic?: string): Promise<void> {
    await this.q(`INSERT INTO eco_conversations (user_id, ts, summary, topic) VALUES ($1,$2,$3,$4)`, [userId, Date.now(), summary.trim().slice(0, 1000), topic?.slice(0, 60) ?? null]);
  }

  async recentConversations(userId: string, limit = 5): Promise<{ ts: number; summary: string; topic: string | null }[]> {
    const rows = await this.q(`SELECT ts, summary, topic FROM eco_conversations WHERE user_id=$1 ORDER BY ts DESC LIMIT $2`, [userId, Math.min(limit, 20)]);
    return rows.map((row) => ({ ts: Number(row.ts), summary: String(row.summary), topic: row.topic == null ? null : String(row.topic) }));
  }
}

let cachedDb: EcoDb | null = null;
export function ecoDb(): EcoDb {
  if (cachedDb) return cachedDb;
  cachedDb = dbKind() === "postgres" ? new PostgresEcoDb() : new SqliteEcoDb();
  return cachedDb;
}
