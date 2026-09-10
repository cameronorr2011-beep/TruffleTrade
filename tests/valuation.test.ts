import { describe, expect, it } from "vitest";
import { runDcf, runReverseDcf, runComps } from "../core/research/valuation";
import type { DataPack, Fundamentals, Quote, Technicals } from "../core/research/types";

function makePack(over: {
  fcf?: number | null;
  price?: number;
  shares?: number;
  beta?: number | null;
  growth?: number | null;
  debt?: number;
  cash?: number;
  pe?: number | null;
}): DataPack {
  const f: Fundamentals = {
    currency: "USD",
    revenueTtm: 100e9,
    ebitdaTtm: 30e9,
    netIncomeTtm: 20e9,
    fcfTtm: over.fcf !== undefined ? over.fcf : 10e9,
    grossMarginPct: 45,
    operatingMarginPct: 25,
    netMarginPct: 20,
    roicPct: null,
    totalDebt: over.debt ?? 5e9,
    cash: over.cash ?? 2e9,
    sharesOutstanding: over.shares ?? 1e9,
    peTtm: over.pe !== undefined ? over.pe : 25,
    forwardPe: 20,
    evEbitda: null,
    epsTtm: 6,
    beta: over.beta ?? 1.2,
    dividendYieldPct: null,
    revenueGrowthYoYPct: over.growth ?? 10,
    asOf: Date.now(),
    source: "test",
  };
  const quote: Quote = {
    ticker: "TEST",
    name: "TestCo",
    exchange: "NASDAQ",
    currency: "USD",
    price: over.price ?? 150,
    prevClose: null,
    changePct: null,
    marketCap: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    asOf: Date.now(),
    source: "test",
  };
  const tech: Technicals = {
    sma20: null, sma50: null, sma200: null, rsi14: null, macdHist: null, atr14: null, atrPct: null,
    realizedVol20Pct: null, maxDrawdown30dPct: null, support: null, resistance: null, trendRegime: null,
    relStrengthVsSpy30d: null, ret1mPct: null, ret3mPct: null, ret12mPct: null, volumeZ: null,
    bars: 0, asOf: null,
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
    retrievalTs: Date.now(),
    sources: ["test"],
    availability: {},
  };
}

describe("DCF", () => {
  it("produces a fair value with all assumptions exposed", () => {
    const { dcf, error } = runDcf(makePack({}));
    expect(error).toBeNull();
    expect(dcf).not.toBeNull();
    expect(dcf!.fairValue).toBeGreaterThan(0);
    expect(dcf!.assumptions.growthTerminal).toBe(0.025);
    expect(dcf!.assumptions.growthYears1to5).toBeCloseTo(0.10, 3);
    expect(dcf!.sensitivity.length).toBeGreaterThan(0);
    const a = dcf!.assumptions;
    expect(dcf!.equityValue).toBeCloseTo(dcf!.pvExplicit + dcf!.pvTerminal - a.netDebt, 0);
  });

  it("is not applicable without FCF — no fabricated fair value", () => {
    const r = runDcf(makePack({ fcf: null }));
    expect(r.dcf).toBeNull();
    expect(r.error).toMatch(/FCF and price/);
    const neg = runDcf(makePack({ fcf: -1e9 }));
    expect(neg.dcf).toBeNull();
    expect(neg.error).toMatch(/positive free cash flow/);
  });

  it("respects explicit overrides so assumptions can be stressed", () => {
    const base = runDcf(makePack({})).dcf!;
    const stressed = runDcf(makePack({}), { growthYears1to5: 0.01, discountRate: 0.15 }).dcf!;
    expect(stressed.fairValue).toBeLessThan(base.fairValue);
  });
});

describe("reverse DCF", () => {
  it("recovers the growth rate implied by the current price", () => {
    const pack = makePack({});
    const { dcf } = runDcf(pack);
    const r = runReverseDcf(pack, dcf);
    expect(r).not.toBeNull();
    // Sanity: the solved growth must be a finite, plausible number.
    expect(Number.isFinite(r!.impliedGrowthYears1to5)).toBe(true);
    expect(Math.abs(r!.impliedGrowthYears1to5)).toBeLessThan(0.6);
  });

  it("prices above base-case value imply growth above the base assumption", () => {
    // Rich (but solvable) price → the market pays for more growth than a cheap price.
    const rich = makePack({ price: 168 });
    const base = makePack({ price: 150 });
    const { dcf } = runDcf(base);
    const richR = runReverseDcf(rich, dcf);
    const baseR = runReverseDcf(base, dcf);
    expect(richR).not.toBeNull();
    expect(richR!.impliedGrowthYears1to5).toBeGreaterThan(baseR!.impliedGrowthYears1to5);
  });

  it("returns null when the price implies growth above the discount rate (unsolvable)", () => {
    // Price 400 with FCF/share $10 implies more than the discount rate — no honest answer exists.
    const absurd = makePack({ price: 400 });
    const { dcf } = runDcf(makePack({ price: 150 }));
    expect(runReverseDcf(absurd, dcf)).toBeNull();
  });

  it("returns null when the DCF is not applicable", () => {
    const pack = makePack({ fcf: null });
    expect(runReverseDcf(pack, null)).toBeNull();
  });
});

describe("peer comps", () => {
  it("compares company metrics against the peer median", () => {
    const target = makePack({ pe: 30 });
    const peers = [makePack({ pe: 20, price: 100 }), makePack({ pe: 22, price: 100 })];
    const rows = runComps(target, peers);
    const peRow = rows.find((r) => r.metric === "P/E (TTM)");
    expect(peRow).toBeDefined();
    expect(peRow!.value).toBe(30);
    expect(peRow!.peerMedian).toBe(21);
    expect(peRow!.verdict).toBe("richer than peers");
  });

  it("reports insufficient data when peers have nothing", () => {
    const rows = runComps(makePack({}), []);
    const peRow = rows.find((r) => r.metric === "P/E (TTM)");
    expect(peRow!.peerMedian).toBeNull();
    expect(peRow!.verdict).toBe("insufficient data");
  });
});
