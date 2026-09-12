// Competitor peer ranking — "which of these rivals is actually best?"
// Deterministic scoring over keyless provider data. Every input carries
// provenance; a failed peer is marked unavailable, never guessed.

import { yahooChart, yahooSummary, spyCloses } from "./providers";
import { rsi, realizedVolPct, relativeStrength } from "./indicators";

export interface PeerMetrics {
  ticker: string;
  name: string | null;
  price: number | null;
  momentum21dPct: number | null;
  rsi14: number | null;
  relStrength21dPct: number | null; // outperformance vs SPY
  vol30Pct: number | null;
  peTtm: number | null;
  grossMarginPct: number | null;
  revenueGrowthYoYPct: number | null;
  provider: string;
  error?: string; // set when this peer's data was unavailable
}

export interface PeerRanking {
  subject: string;
  ranked: PeerMetrics[];
  best: string | null;
  subjectIsBest: boolean;
  unavailable: string[];
  scoredAt: number;
}

/** Static sector maps for the tickers we see most; unknown tickers rank solo. */
const PEER_MAP: Record<string, string[]> = {
  NVDA: ["AMD", "AVGO", "INTC", "QCOM", "MU"],
  AMD: ["NVDA", "AVGO", "INTC", "QCOM", "MU"],
  AVGO: ["NVDA", "AMD", "QCOM", "TXN", "MU"],
  INTC: ["AMD", "NVDA", "QCOM", "TXN"],
  QCOM: ["NVDA", "AMD", "AVGO", "TXN"],
  AAPL: ["MSFT", "GOOGL", "AMZN", "META"],
  MSFT: ["AAPL", "GOOGL", "AMZN", "META"],
  GOOGL: ["MSFT", "AAPL", "AMZN", "META"],
  AMZN: ["MSFT", "GOOGL", "AAPL", "META"],
  META: ["GOOGL", "MSFT", "AAPL", "SNAP"],
  TSLA: ["F", "GM", "RIVN", "TM"],
  F: ["GM", "TSLA", "TM"],
  GM: ["F", "TSLA", "TM"],
  JPM: ["BAC", "WFC", "C", "GS"],
  BAC: ["JPM", "WFC", "C", "GS"],
  GS: ["JPM", "MS", "BAC"],
  V: ["MA", "PYPL", "SQ"],
  MA: ["V", "PYPL"],
  KO: ["PEP", "KDP", "MNST"],
  PEP: ["KO", "KDP"],
  XOM: ["CVX", "COP", "SHEL"],
  CVX: ["XOM", "COP", "SHEL"],
  PFE: ["MRK", "JNJ", "LLY"],
  MRK: ["PFE", "JNJ", "LLY"],
  LLY: ["PFE", "JNJ", "MRK", "NVO"],
  JNJ: ["PFE", "MRK", "ABT"],
  WMT: ["COST", "TGT", "KR"],
  COST: ["WMT", "TGT", "KR"],
  DIS: ["NFLX", "CMCSA", "WBD"],
  NFLX: ["DIS", "CMCSA", "WBD"],
  BA: ["LMT", "RTX", "GD"],
  LMT: ["BA", "RTX", "GD"],
  UBER: ["LYFT", "DASH"],
  SHOP: ["SQ", "PYPL"],
  CRM: ["ORCL", "SAP", "NOW"],
  ORCL: ["CRM", "SAP", "NOW"],
  PLTR: ["CRWD", "SNOW"],
  SNOW: ["PLTR", "CRWD"],
  MSTR: ["COIN", "MARA"],
  COIN: ["MSTR", "HOOD"],
  BTC: ["ETH", "SOL"],
  ETH: ["BTC", "SOL"],
};

export function peersFor(ticker: string): string[] {
  return PEER_MAP[ticker.toUpperCase()] ?? [];
}

function pctChange(closes: number[], bars: number): number | null {
  if (closes.length < bars + 1) return null;
  const then = closes[closes.length - 1 - bars];
  const now = closes[closes.length - 1];
  return then > 0 ? ((now - then) / then) * 100 : null;
}

async function peerMetrics(ticker: string, spy: number[]): Promise<PeerMetrics> {
  const { quote, candles } = await yahooChart(ticker, "3mo", "1d");
  const closes = candles.map((c) => c.close);
  if (closes.length < 10) throw new Error("insufficient history");

  const summary = await yahooSummary(ticker).catch(() => null);
  const rs = relativeStrength(closes, spy, 21);

  return {
    ticker,
    name: quote.name ?? null,
    price: quote.price ?? null,
    momentum21dPct: pctChange(closes, 21),
    rsi14: rsi(closes, 14),
    relStrength21dPct: rs,
    vol30Pct: realizedVolPct(closes, 30),
    peTtm: summary?.fundamentals.peTtm ?? null,
    grossMarginPct: summary?.fundamentals.grossMarginPct ?? null,
    revenueGrowthYoYPct: summary?.fundamentals.revenueGrowthYoYPct ?? null,
    provider: "yahoo",
  };
}

/** Normalize a value to 0..1 across the group (missing → 0.5 neutral). */
function norm(values: (number | null)[], value: number | null, invert = false): number {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (value == null || !Number.isFinite(value) || nums.length < 2) return 0.5;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max === min) return 0.5;
  const t = (value - min) / (max - min);
  return invert ? 1 - t : t;
}

/**
 * Composite score (documented, fixed):
 *   momentum 30% · relative strength 25% · revenue growth 20% ·
 *   gross margin 15% · low volatility 10%
 */
export async function rankPeers(ticker: string): Promise<PeerRanking> {
  const subject = ticker.toUpperCase();
  const universe = [subject, ...peersFor(subject)];
  const spy = await spyCloses(40).catch(() => [] as number[]);

  const settled = await Promise.allSettled(universe.map((t) => peerMetrics(t, spy)));
  const metrics: PeerMetrics[] = [];
  const unavailable: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") metrics.push(r.value);
    else unavailable.push(`${universe[i]}: ${(r.reason as Error)?.message ?? "unavailable"}`);
  });

  const ranked: (PeerMetrics & { score: number })[] = metrics
    .map((m) => {
      const score =
        0.3 * norm(metrics.map((x) => x.momentum21dPct), m.momentum21dPct) +
        0.25 * norm(metrics.map((x) => x.relStrength21dPct), m.relStrength21dPct) +
        0.2 * norm(metrics.map((x) => x.revenueGrowthYoYPct), m.revenueGrowthYoYPct) +
        0.15 * norm(metrics.map((x) => x.grossMarginPct), m.grossMarginPct) +
        0.1 * norm(metrics.map((x) => x.vol30Pct), m.vol30Pct, true);
      return { ...m, score: Math.round(score * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.ticker ?? null;
  return {
    subject,
    ranked: ranked.map(({ score: _score, ...rest }) => rest),
    best,
    subjectIsBest: best === subject,
    unavailable,
    scoredAt: Date.now(),
  };
}
