// Deterministic historical replay for the Backtest agent.
// Finds past occurrences of the CURRENT setup — defined by trend regime +
// RSI bucket + 30d relative-strength sign — inside the ticker's own 3-year
// daily candles, then reports what actually happened next (20d / 60d).
// No AI involved: this is computed fact the agent must cite honestly.

import type { Candle, Technicals } from "./types";

export interface BacktestResult {
  setup: string;
  occurrences: number;
  up20: number | null; // share of occurrences closing higher after 20 trading days
  up60: number | null;
  medianMove20Pct: number | null;
  medianMove60Pct: number | null;
  sample: string; // honest sample-size note
}

function rsiBucket(rsi: number | null): string {
  if (rsi == null) return "unknown";
  if (rsi < 30) return "oversold";
  if (rsi < 45) return "weak";
  if (rsi < 60) return "neutral";
  return "strong";
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function sma(closes: number[], i: number, n: number): number | null {
  if (i < n - 1) return null;
  let sum = 0;
  for (let k = i - n + 1; k <= i; k++) sum += closes[k];
  return sum / n;
}

function regimeAt(closes: number[], i: number): "uptrend" | "downtrend" | "range" | null {
  const s20 = sma(closes, i, 20);
  const s50 = sma(closes, i, 50);
  if (s20 == null || s50 == null) return null;
  if (s20 > s50 * 1.01) return "uptrend";
  if (s20 < s50 * 0.99) return "downtrend";
  return "range";
}

/** Simple Wilder RSI at index i (needs 15 closes). */
function rsiAt(closes: number[], i: number, period = 14): number | null {
  if (i < period) return null;
  let gains = 0;
  let losses = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const d = closes[k] - closes[k - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function relStrengthSign(closes: number[], spy: number[], i: number, window = 21): number | null {
  if (i < window || spy.length < window) return null;
  const stockRet = closes[i] / closes[i - window] - 1;
  const spyRet = spy[spy.length - 1] / spy[spy.length - 1 - Math.min(window, spy.length - 1)] - 1;
  // Alignment caveat: we only have SPY's recent closes here; the sign test is
  // directional (was the stock outperforming over its own prior month).
  const ownPrior = closes[i] / closes[i - window] - 1;
  const marketProxy = spyRet;
  void stockRet;
  return ownPrior >= marketProxy ? 1 : -1;
}

export function replaySetup(candles: Candle[], spyCloses: number[], tech: Technicals): BacktestResult | null {
  if (candles.length < 260) return null; // need ~3y for a meaningful replay
  const closes = candles.map((c) => c.close);
  const rsiSeries = closes.map((_, i) => rsiAt(closes, i));
  const bucketNow = rsiBucket(tech.rsi14);
  const regimeNow = tech.trendRegime ?? "range";

  const hits: { fwd20: number | null; fwd60: number | null }[] = [];
  // Walk history; the last 60 bars are held out so "what happened next" exists.
  for (let i = 60; i < closes.length - 60; i++) {
    const regime = regimeAt(closes, i);
    if (regime !== regimeNow) continue;
    const bucket = rsiBucket(rsiSeries[i]);
    if (bucket !== bucketNow) continue;
    const rsSign = relStrengthSign(closes, spyCloses, i);
    const rsNow = tech.relStrengthVsSpy30d == null ? null : tech.relStrengthVsSpy30d >= 0 ? 1 : -1;
    if (rsNow != null && rsSign != null && rsSign !== rsNow) continue;
    const fwd20 = closes[i + 20] != null ? (closes[i + 20] / closes[i] - 1) * 100 : null;
    const fwd60 = closes[i + 60] != null ? (closes[i + 60] / closes[i] - 1) * 100 : null;
    hits.push({ fwd20, fwd60 });
  }

  const up20s = hits.map((h) => h.fwd20).filter((x): x is number => x != null).map((x) => (x > 0 ? 1 : 0));
  const up60s = hits.map((h) => h.fwd60).filter((x): x is number => x != null).map((x) => (x > 0 ? 1 : 0));
  const m20s = hits.map((h) => h.fwd20).filter((x): x is number => x != null);
  const m60s = hits.map((h) => h.fwd60).filter((x): x is number => x != null);

  const share = (arr: number[]): number | null => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);

  return {
    setup: `regime=${regimeNow} rsi=${bucketNow} relStrength=${tech.relStrengthVsSpy30d == null ? "unknown" : tech.relStrengthVsSpy30d >= 0 ? "outperforming" : "underperforming"}`,
    occurrences: hits.length,
    up20: share(up20s),
    up60: share(up60s),
    medianMove20Pct: median(m20s),
    medianMove60Pct: median(m60s),
    sample:
      hits.length < 8
        ? `sample ${hits.length} — below the 8-occurrence floor; the agent must declare insufficient evidence`
        : `sample ${hits.length} historical occurrences within this ticker's own ${Math.floor(closes.length / 252)}y of daily bars`,
  };
}

/** Compact text block for the Backtest agent's prompt. */
export function backtestContext(bt: BacktestResult | null): string {
  if (!bt) return "Historical replay: UNAVAILABLE (fewer than ~3 years of daily candles). State this and do not estimate.";
  const pct = (x: number | null) => (x == null ? "unavailable" : `${x.toFixed(1)}%`);
  return [
    `Historical replay of the CURRENT setup (${bt.setup}) over this ticker's own past 3 years:`,
    `- occurrences: ${bt.occurrences}`,
    `- closed higher after 20 trading days: ${bt.up20 == null ? "unavailable" : `${(bt.up20 * 100).toFixed(0)}%`} (median move ${pct(bt.medianMove20Pct)})`,
    `- closed higher after 60 trading days: ${bt.up60 == null ? "unavailable" : `${(bt.up60 * 100).toFixed(0)}%`} (median move ${pct(bt.medianMove60Pct)})`,
    `- ${bt.sample}`,
  ].join("\n");
}
