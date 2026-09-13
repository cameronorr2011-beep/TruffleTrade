import { describe, expect, it } from "vitest";
import { extractClaims, factCheckAgent, metricTable, stripViolatedNumbers } from "../core/research/factcheck";
import type { AgentOutput, DataPack, Fundamentals, Quote, Technicals } from "../core/research/types";

function makePack(over: { rsi?: number | null; price?: number; pe?: number | null; stale?: boolean }): DataPack {
  const quote: Quote = {
    ticker: "TEST",
    name: "TestCo",
    exchange: "NASDAQ",
    currency: "USD",
    price: over.price ?? 150,
    prevClose: 148,
    changePct: 1.35,
    marketCap: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    asOf: over.stale ? Date.now() - 10 * 86_400_000 : Date.now(),
    source: "test",
  };
  const tech: Technicals = {
    sma20: null, sma50: null, sma200: null,
    rsi14: over.rsi !== undefined ? over.rsi : 62,
    macdHist: null, atr14: null, atrPct: null,
    realizedVol20Pct: null, maxDrawdown30dPct: null, support: null, resistance: null, trendRegime: null,
    relStrengthVsSpy30d: null, ret1mPct: null, ret3mPct: null, ret12mPct: null, volumeZ: null,
    bars: 0, asOf: null,
  };
  const f: Fundamentals | null = {
    currency: "USD",
    revenueTtm: null, ebitdaTtm: null, netIncomeTtm: null, fcfTtm: null,
    grossMarginPct: null, operatingMarginPct: null, netMarginPct: null, roicPct: null,
    totalDebt: null, cash: null, sharesOutstanding: null,
    peTtm: over.pe !== undefined ? over.pe : 28,
    forwardPe: null, evEbitda: null, epsTtm: null, beta: null,
    dividendYieldPct: null, revenueGrowthYoYPct: null,
    asOf: Date.now(), source: "test",
  };
  return {
    ticker: "TEST",
    quote,
    candles1d: [],
    technicals: tech,
    fundamentals: f,
    fundamentalsError: null,
    news: [],
    macro: [],
    spyCloses: [],
    street: null,
    retrievalTs: Date.now(),
    sources: ["test"],
    availability: {},
  };
}

function makeAgent(text: string): AgentOutput {
  return {
    agent: "Technicals",
    promptVersion: "test-v1",
    stance: "neutral",
    confidence: 0.5,
    rationale: text,
    evidence: [],
    numericClaims: [],
    strengths: [],
    weaknesses: [],
    assumptions: [],
    violations: [],
    model: "test",
  };
}

describe("claim extraction", () => {
  it("extracts an RSI claim from prose", () => {
    const pack = makePack({});
    const claims = extractClaims("The RSI 62 shows momentum cooling.", pack);
    expect(claims.some((c) => c.metric === "rsi14" && c.value === 62)).toBe(true);
  });

  it("extracts price and P/E claims", () => {
    const pack = makePack({});
    const text = "Price $150 with P/E 28.0 leaves little room.";
    const claims = extractClaims(text, pack);
    expect(claims.some((c) => c.metric === "price" && c.value === 150)).toBe(true);
    expect(claims.some((c) => c.metric === "peTtm" && c.value === 28)).toBe(true);
  });

  it("ignores numbers not attached to a known metric phrase", () => {
    const claims = extractClaims("There are 4 quarters in a year and 7 dwarfs.", makePack({}));
    expect(claims.length).toBe(0);
  });

  it("does not read the 20 in 'SMA20' as a $20 price claim (regression: live NVDA run)", () => {
    const pack = makePack({});
    const claims = extractClaims("Price is above SMA20 and SMA50, but below SMA200.", pack);
    expect(claims.filter((c) => c.metric === "price")).toHaveLength(0);
    expect(claims.filter((c) => c.metric.startsWith("sma"))).toHaveLength(0);
  });

  it("does not treat comparative language as a claim (regression: live NVDA run)", () => {
    const pack = makePack({});
    // Live bug: 'price 20' was extracted from 'price is above 20-day average ...'
    const claims = extractClaims("The price is above the 20-day and 50-day averages, a bullish structure.", pack);
    expect(claims.filter((c) => c.metric === "price" && c.value === 20)).toHaveLength(0);
  });

  it("extracts a claim stated through connectors ('SMA20 is 220.51')", () => {
    const pack = makePack({});
    pack.technicals.sma20 = 220.51;
    const claims = extractClaims("SMA20 is 220.51, indicating the trend is intact.", pack);
    expect(claims.some((c) => c.metric === "sma20" && Math.abs(c.value - 220.51) < 0.01)).toBe(true);
  });
});

describe("fact checking", () => {
  it("passes a truthful agent with zero violations", () => {
    const pack = makePack({});
    const a = makeAgent("RSI 62 and price $150 suggest consolidation; trailing P/E 28 is reasonable.");
    const { violations } = factCheckAgent(a, pack);
    expect(violations).toHaveLength(0);
  });

  it("flags a hallucinated RSI that contradicts the data pack", () => {
    const pack = makePack({ rsi: 62 });
    const a = makeAgent("RSI 35 signals deeply oversold conditions.");
    const { violations } = factCheckAgent(a, pack);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe("contradicted");
    expect(violations[0].metric).toBe("rsi14");
    expect(violations[0].actual).toBe(62);
  });

  it("flags a number for a metric the data pack does not have (unsupported)", () => {
    const pack = makePack({ pe: null });
    const a = makeAgent("The forward P/E 19 makes this cheap.");
    const { violations } = factCheckAgent(a, pack);
    expect(violations.some((v) => v.reason === "unsupported-number")).toBe(true);
  });

  it("allows trivial rounding within tolerance", () => {
    const pack = makePack({ rsi: 61.8 });
    const a = makeAgent("RSI 62 with price $150.");
    const { violations } = factCheckAgent(a, pack);
    expect(violations).toHaveLength(0);
  });

  it("flags stale data as a violation", () => {
    const pack = makePack({ stale: true });
    const a = makeAgent("Momentum looks stable.");
    const { violations } = factCheckAgent(a, pack);
    expect(violations.some((v) => v.reason === "stale-data")).toBe(true);
  });

  it("metricTable includes only available values", () => {
    const t = metricTable(makePack({}));
    expect(t.rsi14).toBe(62);
    expect(t.price).toBe(150);
    expect(t.peTtm).toBe(28);
    expect(t.sma200).toBeUndefined();
  });
});

describe("violation stripping", () => {
  it("removes unsupported numbers from prose", () => {
    const text = "RSI 35 is oversold, technically strong.";
    const out = stripViolatedNumbers(text, [
      { claim: "rsi14: 35", metric: "rsi14", stated: 35, actual: null, reason: "unsupported-number", detail: "x" },
    ]);
    expect(out).not.toContain("35");
    expect(out).toContain("[number removed");
  });

  it("does not mangle identifiers when stripping (regression: live NVDA run)", () => {
    // Live bug: stripping stated=20 rewrote 'SMA20' → 'SMA[number removed]'.
    const text = "Price is above SMA20 and holding.";
    const out = stripViolatedNumbers(text, [
      { claim: "price: 20", metric: "price", stated: 20, actual: 218.36, reason: "contradicted", detail: "x" },
    ]);
    expect(out).toContain("SMA20");
    expect(out).not.toContain("SMA[number removed");
  });
});
