import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// Isolated SQLite file per test run (same pattern as the other store tests).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-eco-test-"));
process.env.SQLITE_PATH = path.join(tmpDir, "eco.sqlite3");
delete process.env.DATABASE_URL; // force the SQLite backend

import { ecoDb } from "../core/eco/store";
import type { EcoDb } from "../core/eco/store";

let db: EcoDb;
const U = "userhash-abc";
const U2 = "userhash-def";

beforeAll(() => {
  db = ecoDb();
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // windows file locks — best effort
  }
});

describe("eco store — theses", () => {
  it("creates and lists theses scoped to the user", async () => {
    const id = await db.createThesis(U, {
      asset: "nvda",
      claim: "AI infrastructure spending stays strong through next year",
      timeHorizon: "12 months",
      supportingEvidence: ["datacenter demand"],
      counterarguments: [],
      keyRisks: ["valuation"],
      invalidationConditions: ["capex down 10% y/y"],
      confidence: 60,
      status: "active",
    });
    expect(id).toBeGreaterThan(0);

    const mine = await db.listTheses(U);
    expect(mine).toHaveLength(1);
    expect(mine[0].asset).toBe("NVDA"); // normalized to uppercase
    expect(mine[0].supportingEvidence).toEqual(["datacenter demand"]);
    expect(mine[0].status).toBe("active");

    // another user sees nothing — scoping works
    const theirs = await db.listTheses(U2);
    expect(theirs).toHaveLength(0);
  });

  it("updates a thesis and records events", async () => {
    const [t] = await db.listTheses(U);
    const ok = await db.updateThesis(U, t.id, { status: "invalidated", claim: t.claim });
    expect(ok).toBe(true);
    await db.recordThesisEvent(U, t.id, "status-change", "invalidated by test");
    const events = await db.thesisEvents(U, t.id);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("status-change");

    // cannot update someone else's thesis
    expect(await db.updateThesis(U2, t.id, { status: "retired" })).toBe(false);
  });

  it("filters by asset and status", async () => {
    await db.createThesis(U, {
      asset: "TSLA",
      claim: "Energy storage margins expand faster than auto",
      timeHorizon: null,
      supportingEvidence: [],
      counterarguments: [],
      keyRisks: [],
      invalidationConditions: [],
      confidence: null,
      status: "active",
    });
    expect(await db.listTheses(U, { asset: "tsla" })).toHaveLength(1);
    expect(await db.listTheses(U, { status: "invalidated" })).toHaveLength(1);
    expect(await db.listTheses(U, { status: "validated" })).toHaveLength(0);
  });
});

describe("eco store — journal + outcomes", () => {
  it("records entries, attaches outcomes, scopes ownership", async () => {
    const id = await db.createJournalEntry(U, {
      asset: "TSLA",
      belief: "Momentum continues into earnings",
      reasoning: "20-day breakout on volume",
      evidence: ["breakout", "volume 2x avg"],
      expectation: "rides higher",
      invalidation: "closes back below 50-day",
    });
    expect(id).toBeGreaterThan(0);

    let entries = await db.listJournal(U);
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBeNull();

    expect(await db.addOutcome(U, id, "stock fell 4% after earnings")).toBe(true);
    entries = await db.listJournal(U);
    expect(entries[0].outcome?.whatHappened).toContain("fell 4%");

    // other user cannot attach an outcome to someone else's entry
    expect(await db.addOutcome(U2, id, "hijack")).toBe(false);

    // asset filter
    expect(await db.listJournal(U, { asset: "AAPL" })).toHaveLength(0);
    expect(await db.listJournal(U, { asset: "TSLA" })).toHaveLength(1);
  });
});

describe("eco store — notes, learning, prefs, conversations", () => {
  it("stores and lists notes", async () => {
    await db.createNote(U, { title: "NVDA notes", body: "Gross margin inflected", tags: ["nvda", "margins"] });
    const notes = await db.listNotes(U);
    expect(notes).toHaveLength(1);
    expect(notes[0].tags).toEqual(["nvda", "margins"]);
  });

  it("aggregates lesson progress by topic", async () => {
    await db.recordLesson(U, { topic: "Risk", lesson: "Position sizing", quizScore: 80, completedAt: Date.now() });
    await db.recordLesson(U, { topic: "Risk", lesson: "Drawdowns", quizScore: 90, completedAt: Date.now() });
    const prog = await db.lessonProgress(U);
    expect(prog).toHaveLength(1);
    expect(prog[0].attempts).toBe(2);
    expect(prog[0].bestScore).toBe(90);
  });

  it("upserts preferences and stores conversation summaries", async () => {
    await db.setPref(U, "explanation-depth", "detailed");
    await db.setPref(U, "explanation-depth", "concise"); // overwrite
    expect(await db.getPrefs(U)).toEqual({ "explanation-depth": "concise" });

    await db.saveConversationSummary(U, "asked about NVDA thesis", "NVDA");
    const convos = await db.recentConversations(U, 5);
    expect(convos).toHaveLength(1);
    expect(convos[0].topic).toBe("NVDA");
  });
});
