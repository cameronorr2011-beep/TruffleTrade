// Deterministic valuation models. Every output exposes its assumptions —
// never a bare "fair value = $X" (spec §2/§11).

import type { DataPack, DcfAssumptions, DcfResult, ReverseDcfResult, ValuationModel } from "./types";

/**
 * Inverse DCF: solves for the FCF growth rate (years 1-5) implied by the current
 * price, given fixed discount and terminal-growth assumptions.
 * `price` is per-share and `baseFcfPerShare` must be FCF per share (same units).
 * The valuation function f(g) is strictly increasing in g on (-1, r) with a pole
 * at g = r, so the search must stay strictly below the pole.
 */
export function impliedGrowthFromPrice(
  price: number,
  baseFcfPerShare: number,
  discountRate: number,
  terminalGrowth: number,
  years = 5,
): number | null {
  const pvFactor = (1 + discountRate) ** years;
  const f = (g: number): number => {
    let s = 0;
    for (let i = 1; i <= years; i++) s += (baseFcfPerShare * (1 + g) ** i) / (1 + discountRate) ** i;
    const terminalFcf = baseFcfPerShare * (1 + g) ** years * (1 + terminalGrowth);
    const tv = terminalFcf / (discountRate - terminalGrowth);
    return s + tv / pvFactor - price;
  };
  // Search strictly below the discount rate; f(lo) < 0 < f(hi) must hold.
  const hi = Math.min(discountRate - 0.005, 0.9);
  const lo = -0.9;
  const fLo = f(lo);
  const fHi = f(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo > 0 || fHi < 0) return null;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 80; i++) {
    const mid = (a + b) / 2;
    const fm = f(mid);
    if (!Number.isFinite(fm)) return null;
    if (fm < 0) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

export function runDcf(
  pack: DataPack,
  overrides: Partial<DcfAssumptions> = {},
): { dcf: DcfResult | null; error: string | null } {
  const f = pack.fundamentals;
  const price = pack.quote.price;
  if (!f || f.fcfTtm == null || price == null) {
    return { dcf: null, error: "requires FCF and price — DATA UNAVAILABLE" };
  }
  if (f.fcfTtm <= 0) {
    return { dcf: null, error: `FCF is ${f.fcfTtm.toFixed(0)} — DCF requires positive free cash flow (model not applicable)` };
  }
  const shares = f.sharesOutstanding;
  if (!shares || shares <= 0) {
    return { dcf: null, error: "requires shares outstanding — DATA UNAVAILABLE" };
  }
  const netDebt = (f.totalDebt ?? 0) - (f.cash ?? 0);
  // Default assumptions — deliberately conservative, always displayed.
  const assumptions: DcfAssumptions = {
    baseFcf: f.fcfTtm,
    growthYears1to5: Math.min(0.15, Math.max(0.02, (f.revenueGrowthYoYPct ?? 5) / 100)),
    growthTerminal: 0.025,
    discountRate: Math.max(0.08, 0.06 + (f.beta ?? 1.2) * 0.04),
    sharesOutstanding: shares,
    netDebt,
    ...overrides,
  };
  const { baseFcf, growthYears1to5: g, growthTerminal: tg, discountRate: r, sharesOutstanding: sh, netDebt: nd } = assumptions;
  const years = 5;
  let pvExplicit = 0;
  for (let i = 1; i <= years; i++) pvExplicit += (baseFcf * (1 + g) ** i) / (1 + r) ** i;
  const terminalFcf = baseFcf * (1 + g) ** years * (1 + tg);
  const tv = terminalFcf / (r - tg);
  const pvTerminal = tv / (1 + r) ** years;
  const equityValue = pvExplicit + pvTerminal - nd;
  const fairValue = equityValue / sh;

  // Sensitivity grid: discount rate × terminal growth
  const sensitivity: DcfResult["sensitivity"] = [];
  for (const dr of [r - 0.02, r, r + 0.02]) {
    for (const g2 of [tg - 0.01, tg, tg + 0.01]) {
      if (dr - g2 <= 0.01) continue;
      let pv = 0;
      for (let i = 1; i <= years; i++) pv += (baseFcf * (1 + g) ** i) / (1 + dr) ** i;
      const tf2 = baseFcf * (1 + g) ** years * (1 + g2);
      const fv = (pv + tf2 / (dr - g2) / (1 + dr) ** years - nd) / sh;
      sensitivity.push({
        discountRate: Math.round(dr * 1000) / 1000,
        terminalGrowth: Math.round(g2 * 1000) / 1000,
        fairValue: Math.round(fv * 100) / 100,
      });
    }
  }

  return {
    dcf: {
      fairValue: Math.round(fairValue * 100) / 100,
      equityValue,
      pvExplicit,
      pvTerminal,
      assumptions,
      sensitivity,
    },
    error: null,
  };
}

export function runReverseDcf(pack: DataPack, dcf: DcfResult | null): ReverseDcfResult | null {
  const f = pack.fundamentals;
  const price = pack.quote.price;
  if (!dcf || !f || price == null || !f.fcfTtm || f.fcfTtm <= 0 || !f.sharesOutstanding) return null;
  const { discountRate, growthTerminal, sharesOutstanding, netDebt } = dcf.assumptions;
  // Solve in per-share units: FCF per share, ignoring net debt per share would
  // bias the implied growth, so subtract it from the target price first.
  const netDebtPerShare = netDebt / sharesOutstanding;
  const fcfPerShare = f.fcfTtm / sharesOutstanding;
  const target = price + netDebtPerShare / (1 + discountRate) ** 5; // approximate debt PV adjustment
  const g = impliedGrowthFromPrice(target, fcfPerShare, discountRate, growthTerminal);
  if (g == null) return null;
  return {
    impliedGrowthYears1to5: Math.round(g * 1000) / 1000,
    price,
    assumptions: { baseFcf: f.fcfTtm, growthTerminal, discountRate, sharesOutstanding, netDebt },
    note:
      "Growth rate the market is pricing in, given these discount/terminal assumptions. " +
      "If implied growth exceeds any plausible operating forecast, expectations are likely already rich.",
  };
}

export function runComps(pack: DataPack, peers: DataPack[]): ValuationModel["comps"] {
  const f = pack.fundamentals;
  if (!f) return [];
  const median = (xs: (number | null)[]): number | null => {
    const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
    if (!v.length) return null;
    const s = [...v].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const verdict = (value: number | null, peerMedian: number | null, lowerIsCheaper: boolean): string => {
    if (value == null || peerMedian == null || peerMedian === 0) return "insufficient data";
    const ratio = value / peerMedian;
    if (lowerIsCheaper) {
      if (ratio < 0.8) return "cheaper than peers";
      if (ratio > 1.25) return "richer than peers";
    } else {
      if (ratio > 1.25) return "higher than peers";
      if (ratio < 0.8) return "lower than peers";
    }
    return "in line with peers";
  };
  const rows: { metric: string; value: number | null; peerMedian: number | null; verdict: string }[] = [];
  const metrics: { name: string; get: (f: DataPack["fundamentals"]) => number | null; lowerIsCheaper: boolean }[] = [
    { name: "P/E (TTM)", get: (ff) => ff?.peTtm ?? null, lowerIsCheaper: true },
    { name: "Forward P/E", get: (ff) => ff?.forwardPe ?? null, lowerIsCheaper: true },
    { name: "Gross margin %", get: (ff) => ff?.grossMarginPct ?? null, lowerIsCheaper: false },
    { name: "Operating margin %", get: (ff) => ff?.operatingMarginPct ?? null, lowerIsCheaper: false },
    { name: "Revenue growth YoY %", get: (ff) => ff?.revenueGrowthYoYPct ?? null, lowerIsCheaper: false },
  ];
  for (const m of metrics) {
    const value = m.get(f);
    const peerMedian = median(peers.map((p) => m.get(p.fundamentals)));
    rows.push({ metric: m.name, value, peerMedian, verdict: verdict(value, peerMedian, m.lowerIsCheaper) });
  }
  return rows;
}
