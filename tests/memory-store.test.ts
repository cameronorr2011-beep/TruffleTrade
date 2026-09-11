import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  ingestRunFacts,
  recordPredictionOutcome,
  recordRegime,
  recall,
  reinforceSimilar,
  memoryStats,
  consolidate,
  exportFederatedBatch,
  setLastAutoUpdateTs,
} from "../core/memory/memory";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-memory-test-"));
process.env.MEMORY_DB_PATH = path.join(tmpDir, "memory.sqlite3");

beforeAll(() => {
  // module-level cached DB binds lazily on first use — env is already set
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // windows file locks — best effort
  }
});

describe("memory store", () => {
  const ts = Date.now();

  it("ingests run facts, predictions, outcomes, and regimes", () => {
    ingestRunFacts({
      ticker: "NVDA",
      runId: 1,
      consensus: { stance: "bullish", score: 6 },
      thesisSummary: "Datacenter demand drives margins above consensus",
      redTeamObjections: ["valuation already assumes perfect execution"],
      facts: ["gross margin expanded 3 points QoQ", "datacenter revenue up 90% YoY"],
      ts,
    });
    recordPredictionOutcome({
      ticker: "NVDA",
      stance: "bullish",
      direction: "up",
      expectedMovePct: 8,
      horizonDays: 20,
      priceAtPrediction: 100,
      priceNow: 112,
      ts: ts + 1000,
      source: "research:1",
    });
    recordRegime("SPY", "calm-uptrend", 0.9, 4.2, ts, "twin:bootstrap");
    const stats = memoryStats();
    expect(stats.totalFacts).toBeGreaterThanOrEqual(6);
    expect(stats.byKind.analyst_insight).toBeGreaterThanOrEqual(3);
    expect(stats.byKind.prediction).toBe(1);
    expect(stats.byKind.outcome).toBe(1);
    expect(stats.byKind.market_regime).toBe(1);
  });

  it("recalls by subject with relevance ranking", () => {
    const results = recall({ subjects: ["NVDA"], limit: 10 });
    expect(results.length).toBeGreaterThanOrEqual(5);
    for (const r of results) expect(r.fact.subject).toBe("NVDA");
    // outcome + prediction + thesis should rank somewhere in top results
    const contents = results.map((r) => r.fact.content).join(" | ");
    expect(contents).toContain("resolved correct");
    expect(contents).toContain("thesis:");
  });

  it("filters by kind and query", () => {
    const onlyOutcomes = recall({ kinds: ["outcome"] });
    expect(onlyOutcomes.length).toBe(1);
    const queried = recall({ query: "datacenter revenue" });
    expect(queried.length).toBeGreaterThan(0);
    expect(queried[0].fact.content).toContain("datacenter");
  });

  it("reinforces near-duplicates instead of duplicating", () => {
    const before = memoryStats().totalFacts;
    reinforceSimilar({
      kind: "analyst_insight",
      subject: "NVDA",
      content: "gross margin expanded 3 points QoQ",
      confidence: 0.6,
      createdAt: Date.now(),
      source: "user",
    });
    const after = memoryStats().totalFacts;
    expect(after).toBe(before); // reinforced, not duplicated
    const hits = recall({ subjects: ["NVDA"], query: "gross margin" });
    const match = hits.find((h) => h.fact.content.includes("gross margin"));
    expect(match?.fact.reinforcementCount).toBeGreaterThan(1);
  });

  it("consolidation merges duplicate facts from repeated ingests", () => {
    const base = {
      ticker: "MSFT",
      runId: 2,
      consensus: { stance: "bullish", score: 3 },
      thesisSummary: "cloud margins expanding",
      redTeamObjections: [] as string[],
      facts: ["azure growth reaccelerated to 30%"],
      ts: Date.now(),
    };
    ingestRunFacts(base);
    const afterFirst = memoryStats().totalFacts;
    ingestRunFacts({ ...base, runId: 3, ts: base.ts + 1000 }); // identical content, different run
    const afterSecond = memoryStats().totalFacts;
    expect(afterSecond).toBeGreaterThan(afterFirst); // duplicate stored
    consolidate();
    expect(memoryStats().totalFacts).toBe(afterFirst); // merged back down
  });

  it("federated export hashes subjects and never leaks content", () => {
    setLastAutoUpdateTs(Date.now() - 60_000);
    const batch = exportFederatedBatch(Date.now() - 120_000);
    expect(batch.tokens).toBeGreaterThan(0);
    expect(batch.batches.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(batch);
    for (const leak of ["NVDA", "SPY", "datacenter", "thesis", "gross margin", "TSLA"]) {
      expect(serialized.includes(leak)).toBe(false);
    }
    for (const b of batch.batches) {
      expect(b.subjectHash).toMatch(/^[0-9a-f]{16}$/);
      for (const kind of Object.keys(b.kindCounts)) {
        expect(["market_regime", "prediction", "outcome", "analyst_insight", "risk_event"].includes(kind)).toBe(true);
      }
    }
  });
});
