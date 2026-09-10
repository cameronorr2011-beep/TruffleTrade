// Deterministic technical indicators for equities (daily bars).
// The AI interprets these numbers; it must never invent them (spec §3).

import type { Candle, Technicals } from "./types";

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (gains === 0 && losses === 0) return 50;
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

export function macdHist(closes: number[]): number | null {
  if (closes.length < 35) return null;
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const line = closes.map((_, i) => ema12[i] - ema26[i]);
  const sig = emaSeries(line.slice(25), 9);
  const m = line[line.length - 1];
  const s = sig[sig.length - 1] ?? 0;
  return m - s;
}

export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < 2) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return sma(trs, period);
}

export function realizedVolPct(closes: number[], bars: number): number | null {
  if (closes.length < bars + 1) return null;
  const rets: number[] = [];
  for (let i = closes.length - bars; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1 || 1);
  return Math.sqrt(variance) * 100 * Math.sqrt(252); // annualized
}

/** Max peak-to-trough drawdown over the last `bars` closes, in percent (negative). */
export function maxDrawdownPct(closes: number[], bars: number): number | null {
  if (closes.length < 2) return null;
  const window = closes.slice(-bars);
  let peak = window[0];
  let mdd = 0;
  for (const c of window) {
    if (c > peak) peak = c;
    const dd = c / peak - 1;
    if (dd < mdd) mdd = dd;
  }
  return mdd * 100;
}

/** 30-day return of the symbol minus 30-day return of SPY (simple relative strength). */
export function relativeStrength(symbolCloses: number[], spyCloses: number[], bars = 21): number | null {
  if (symbolCloses.length < bars + 1 || spyCloses.length < bars + 1) return null;
  const s = symbolCloses[symbolCloses.length - 1] / symbolCloses[symbolCloses.length - 1 - bars] - 1;
  const b = spyCloses[spyCloses.length - 1] / spyCloses[spyCloses.length - 1 - bars] - 1;
  return (s - b) * 100;
}

export function trendRegime(sma20: number | null, sma50: number | null, sma200: number | null, price: number | null): Technicals["trendRegime"] {
  if (price == null || sma20 == null || sma50 == null) return null;
  if (sma200 != null) {
    if (price > sma20 && sma20 > sma50 && sma50 > sma200) return "uptrend";
    if (price < sma20 && sma20 < sma50 && sma50 < sma200) return "downtrend";
  } else if (price > sma20 && sma20 > sma50) return "uptrend";
  else if (price < sma20 && sma20 < sma50) return "downtrend";
  return "range";
}

export function computeTechnicals(candles: Candle[], spyCloses: number[]): Technicals {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1] ?? null;
  const last = candles[candles.length - 1];
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const a = atr(candles, 14);
  // Support/resistance: recent swing window excluding today
  const window = candles.slice(-21, -1);
  const support = window.length ? Math.min(...window.map((c) => c.low)) : null;
  const resistance = window.length ? Math.max(...window.map((c) => c.high)) : null;
  const vols = candles.slice(-30).map((c) => c.volume);
  const volMean = vols.length ? vols.reduce((s, v) => s + v, 0) / vols.length : null;
  const volSd = vols.length
    ? Math.sqrt(vols.reduce((acc, v) => acc + (v - (volMean as number)) ** 2, 0) / vols.length)
    : null;
  const ret = (bars: number): number | null =>
    closes.length > bars ? (closes[closes.length - 1] / closes[closes.length - 1 - bars] - 1) * 100 : null;

  return {
    sma20,
    sma50,
    sma200,
    rsi14: rsi(closes, 14),
    macdHist: macdHist(closes),
    atr14: a,
    atrPct: a != null && price ? (a / price) * 100 : null,
    realizedVol20Pct: realizedVolPct(closes, 20),
    maxDrawdown30dPct: maxDrawdownPct(closes, 30),
    support: support != null && last ? support : null,
    resistance: resistance != null && last ? resistance : null,
    trendRegime: trendRegime(sma20, sma50, sma200, price),
    relStrengthVsSpy30d: relativeStrength(closes, spyCloses, 21),
    ret1mPct: ret(21),
    ret3mPct: ret(63),
    ret12mPct: ret(252),
    volumeZ: volMean && volSd && last ? (last.volume - volMean) / volSd : null,
    bars: candles.length,
    asOf: last?.ts ?? null,
  };
}
