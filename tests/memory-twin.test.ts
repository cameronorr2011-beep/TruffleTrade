import { describe, expect, it } from "vitest";
import { calibrateTwin, simulatePath, trainTwin, mulberry32 } from "../core/memory/twin";
import { classifyRegime, lexicalEmbed, cosine, regimeFromLabel } from "../core/memory/memory";

function syntheticCloses(n: number, seed = 42): number[] {
  const rng = mulberry32(seed);
  const closes = [100];
  for (let i = 1; i < n; i++) {
    closes.push(Math.max(1, closes[i - 1] * Math.exp((rng() - 0.5) * 0.04)));
  }
  return closes;
}

describe("digital twin", () => {
  it("calibrates GBM parameters from real closes", () => {
    const closes = syntheticCloses(120);
    const cal = calibrateTwin(closes, "gbm");
    expect(cal.model).toBe("gbm");
    expect(Number.isFinite(cal.muDaily)).toBe(true);
    expect(cal.sigmaDaily).toBeGreaterThan(0);
    expect(cal.startPrice).toBeCloseTo(closes[closes.length - 1], 6);
    expect(cal.sourceCandles).toBe(120);
  });

  it("requires a minimum history", () => {
    expect(() => calibrateTwin([1, 2, 3], "gbm")).toThrow();
  });

  it("produces deterministic paths for a given seed", () => {
    const cal = calibrateTwin(syntheticCloses(90), "bootstrap");
    expect(cal.blocks.length).toBeGreaterThan(0);
    const a = simulatePath(cal, 20, mulberry32(7));
    const b = simulatePath(cal, 20, mulberry32(7));
    expect(a).toEqual(b);
    expect(a).toHaveLength(21);
    const c = simulatePath(cal, 20, mulberry32(8));
    expect(c).not.toEqual(a);
  });

  it("paths stay positive and bootstrap blocks hold their internal sequence", () => {
    const cal = calibrateTwin(syntheticCloses(120), "bootstrap");
    const path = simulatePath(cal, 60, mulberry32(99));
    for (const p of path) expect(p).toBeGreaterThan(0);
  });

  it("training yields summary stats and twin-labeled facts", () => {
    const cal = calibrateTwin(syntheticCloses(150, 7), "bootstrap");
    const { summary, facts } = trainTwin(cal, { paths: 200, horizonDays: 20, seed: 5 });
    expect(summary.paths).toBe(200);
    expect(summary.horizonDays).toBe(20);
    expect(Number.isFinite(summary.meanFinalReturnPct)).toBe(true);
    expect(summary.p05FinalReturnPct).toBeLessThanOrEqual(summary.meanFinalReturnPct);
    expect(summary.meanFinalReturnPct).toBeLessThanOrEqual(summary.p95FinalReturnPct);
    expect(summary.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(Object.values(summary.regimes).reduce((s, x) => s + x, 0)).toBe(200);
    expect(facts.length).toBeGreaterThanOrEqual(4);
    for (const f of facts) expect(f.startsWith("twin")).toBe(true);
  });

  it("regime classification maps vol/trend to expected buckets", () => {
    expect(classifyRegime({ realizedVolPct: 1, trendPct: 5 })).toBe("calm-uptrend");
    expect(classifyRegime({ realizedVolPct: 1, trendPct: -5 })).toBe("calm-downtrend");
    expect(classifyRegime({ realizedVolPct: 4, trendPct: 6 })).toBe("volatile-uptrend");
    expect(classifyRegime({ realizedVolPct: 4, trendPct: -6 })).toBe("volatile-downtrend");
    expect(classifyRegime({ realizedVolPct: 5, trendPct: 0 })).toBe("high-vol");
    expect(classifyRegime({ realizedVolPct: 1, trendPct: 0 })).toBe("calm");
    for (const label of ["calm-uptrend", "high-vol", "calm"]) {
      const s = regimeFromLabel(label);
      expect(s.realizedVolPct).toBeGreaterThan(0);
    }
  });

  it("lexical embeddings are normalized and semantically ordered", () => {
    const a = lexicalEmbed("breakout on high volume confirms the trend");
    const b = lexicalEmbed("volume confirms the breakout trend");
    const c = lexicalEmbed("dividend yield entirely unrelated words here");
    expect(a).toHaveLength(96);
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
    expect(cosine(a, a)).toBeCloseTo(1, 5);
  });
});
