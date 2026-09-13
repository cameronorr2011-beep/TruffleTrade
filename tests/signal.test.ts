import { describe, expect, it } from "vitest";
import { assembleDeterministic, COST_ASSUMPTION_PCT, type SignalInputs } from "../core/research/signal";
import type { TwinConfidence } from "../core/research/marketIntelligence";

function syntheticCloses(n: number, drift = 0.001, seed = 7): number[] {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const closes = [100];
  for (let i = 1; i < n; i++) closes.push(closes[i - 1] * (1 + drift + (rnd() - 0.5) * 0.012));
  return closes;
}

function twin(overrides: Partial<TwinConfidence> = {}): TwinConfidence {
  return {
    ticker: "TEST",
    direction: "up",
    confidencePct: 40,
    meanReturnPct: 3,
    p05Pct: -4,
    p95Pct: 11,
    upProbabilityPct: 62,
    paths: 800,
    horizonDays: 20,
    calibration: "strong",
    calibrationScore: 0.8,
    sourceCandles: 250,
    label: "MODEL OUTPUT",
    caveat: "test fixture",
    ...overrides,
  };
}

function goodInput(overrides: Partial<SignalInputs> = {}): SignalInputs {
  const closes = syntheticCloses(260);
  return {
    closes,
    candlesHighLow: closes.map((c) => ({ high: c * 1.01, low: c * 0.99 })),
    volumes: null,
    twin: twin(),
    newsScore: 0.4,
    newsLabel: "positive",
    macroScore: 0.3,
    macroLabel: "risk-on",
    street: {
      ticker: "TEST",
      buy: 12,
      overweight: 12,
      hold: 6,
      underweight: 1,
      sell: 1,
      total: 19,
      consensus: "buy",
      targetMean: closes[closes.length - 1] * 1.15,
      targetMedian: null,
      targetHigh: null,
      targetLow: null,
      asOf: Date.now(),
      source: "test:fixture",
    },
    price: closes[closes.length - 1],
    ...overrides,
  };
}

describe("deterministic signal core", () => {
  it("produces a stance with all four legs agreeing", () => {
    const s = assembleDeterministic("TEST", goodInput());
    expect(s.drivers).toHaveLength(5); // trend, twin, news, macro, street
    expect(["bullish", "bearish", "NO TRADE"]).toContain(s.stance);
    if (s.stance !== "NO TRADE") {
      expect(s.confidence).toBeGreaterThan(0);
      expect(s.confidence!).toBeLessThanOrEqual(85);
    }
  });

  it("incorporates street consensus as a bounded driver with provenance", () => {
    const s = assembleDeterministic("TEST", goodInput());
    const street = s.drivers.find((d) => d.source === "street");
    expect(street).toBeDefined();
    expect(street!.weight).toBeLessThanOrEqual(0.2); // opinion, not evidence
    expect(street!.detail).toMatch(/buy|sell|hold/i);
  });

  it("scores sell-heavy street consensus bearish and buy-heavy bullish", () => {
    const sellHeavy = assembleDeterministic(
      "TEST",
      goodInput({ street: { ...goodInput().street!, buy: 2, sell: 14, hold: 8, total: 24, consensus: "underweight" } }),
    );
    const buyHeavy = assembleDeterministic("TEST", goodInput());
    const sell = sellHeavy.drivers.find((d) => d.source === "street")!;
    const buy = buyHeavy.drivers.find((d) => d.source === "street")!;
    expect(sell.contribution).toBeLessThan(0);
    expect(buy.contribution).toBeGreaterThan(sell.contribution);
  });

  it("treats missing street data as unavailable without inventing a driver", () => {
    const s = assembleDeterministic("TEST", goodInput({ street: null }));
    expect(s.drivers.find((d) => d.source === "street")).toBeUndefined();
    expect(s.unavailable.join(" ")).toMatch(/street/i);
  });

  it("is deterministic: identical inputs produce identical output", () => {
    const a = assembleDeterministic("TEST", goodInput());
    const b = assembleDeterministic("TEST", goodInput());
    expect(a.score).toBe(b.score);
    expect(a.stance).toBe(b.stance);
    expect(a.noTradeReason).toBe(b.noTradeReason);
    expect(a.drivers.map((d) => d.contribution)).toEqual(b.drivers.map((d) => d.contribution));
  });

  it("refuses to signal when two or more legs are unavailable (data gate)", () => {
    const s = assembleDeterministic(
      "TEST",
      goodInput({ newsScore: null, newsLabel: "unavailable", macroScore: null, macroLabel: "unavailable" }),
    );
    expect(s.stance).toBe("NO TRADE");
    expect(s.noTradeReason).toContain("insufficient data");
    expect(s.confidence).toBeNull();
  });

  it("refuses when the expected move cannot pay the round-trip cost (edge gate)", () => {
    const s = assembleDeterministic("TEST", goodInput({ twin: twin({ meanReturnPct: COST_ASSUMPTION_PCT / 4 }) }));
    expect(s.stance).toBe("NO TRADE");
    expect(s.noTradeReason).toMatch(/round-trip cost|edge/i);
  });

  it("refuses when uncertainty swamps the edge (band gate)", () => {
    const s = assembleDeterministic(
      "TEST",
      goodInput({ twin: twin({ meanReturnPct: 1.2, p05Pct: -20, p95Pct: 22 }) }),
    );
    expect(s.stance).toBe("NO TRADE");
    expect(s.noTradeReason).toMatch(/uncertainty swamps|noise/i);
  });

  it("refuses when legs fight each other with a small weighted score (cross-current gate)", () => {
    // Trend up, twin up, news and macro hard down → score small, signs split.
    const s = assembleDeterministic(
      "TEST",
      goodInput({ newsScore: -0.9, newsLabel: "negative", macroScore: -0.9, macroLabel: "risk-off" }),
    );
    if (Math.abs(s.score) < 0.4) {
      expect(s.stance).toBe("NO TRADE");
      expect(s.noTradeReason).toMatch(/cross-currents/i);
    } else {
      // If the weighted score is decisive the gate must not have fired.
      expect(s.noTradeReason).not.toMatch(/cross-currents/i);
    }
  });

  it("damps confidence when twin calibration is thin", () => {
    const strong = assembleDeterministic("TEST", goodInput({ twin: twin({ calibrationScore: 0.9, calibration: "strong" }) }));
    const thin = assembleDeterministic("TEST", goodInput({ twin: twin({ calibrationScore: 0.3, calibration: "thin" }) }));
    if (strong.confidence != null && thin.confidence != null) {
      expect(thin.confidence).toBeLessThan(strong.confidence);
    }
    expect(thin.confidenceDamped).toBe(true);
  });

  it("never emits confidence outside the honest band", () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const s = assembleDeterministic("TEST", goodInput({ closes: syntheticCloses(260, 0.001, seed) }));
      if (s.confidence != null) {
        expect(s.confidence).toBeGreaterThanOrEqual(5);
        expect(s.confidence).toBeLessThanOrEqual(85);
      }
    }
  });

  it("always supplies invalidation conditions and a cost assumption", () => {
    const s = assembleDeterministic("TEST", goodInput());
    expect(s.invalidations.length).toBeGreaterThan(0);
    expect(s.costAssumptionPct).toBeGreaterThan(0);
    expect(s.horizonLabel).toMatch(/weeks/i);
  });
});
