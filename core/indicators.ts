import type { Candle, FeaturePack } from "./types";

export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
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
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function macd(closes: number[]): { macd: number; signal: number; hist: number } {
  if (closes.length < 35) return { macd: 0, signal: 0, hist: 0 };
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const line = closes.map((_, i) => ema12[i] - ema26[i]);
  const sig = emaSeries(line.slice(25), 9);
  const m = line[line.length - 1];
  const s = sig[sig.length - 1] ?? 0;
  return { macd: m, signal: s, hist: m - s };
}

export function sma(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
  }
  return sma(trs, period);
}

export function realizedVolPct(closes: number[], bars: number): number {
  if (closes.length < bars + 1) return 0;
  const rets: number[] = [];
  for (let i = closes.length - bars; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1 || 1);
  return Math.sqrt(variance) * 100;
}

export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 10) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a1 = x[i] - mx;
    const b1 = y[i] - my;
    num += a1 * b1;
    dx += a1 * a1;
    dy += b1 * b1;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export function buildFeatures(candles1h: Candle[], candles1d: Candle[]): FeaturePack {
  const closes = candles1h.map((c) => c.close);
  const price = closes[closes.length - 1] ?? 0;
  const m = macd(closes);
  const a = atr(candles1h, 14);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const bbBasis = sma(closes, 20);
  const bbWindow = candles1h.slice(-20);
  const bbSd = Math.sqrt(
    bbWindow.reduce((acc, c) => acc + (c.close - bbBasis) ** 2, 0) / (bbWindow.length || 1),
  );
  const bbUpper = bbBasis + 2 * bbSd;
  const bbLower = bbBasis - 2 * bbSd;
  const vols = candles1h.slice(-30).map((c) => c.volume);
  const volMean = vols.reduce((s, v) => s + v, 0) / (vols.length || 1);
  const volSd = Math.sqrt(vols.reduce((acc, v) => acc + (v - volMean) ** 2, 0) / (vols.length || 1));
  const lastVol = vols[vols.length - 1] ?? 0;
  const dailyCloses = candles1d.map((c) => c.close);
  const ret = (bars: number) =>
    closes.length > bars ? (price / closes[closes.length - 1 - bars] - 1) * 100 : 0;
  const last50 = candles1d.slice(-50).map((c) => c.high);
  const low50 = candles1d.slice(-50).map((c) => c.low);

  return {
    price,
    sma20,
    sma50,
    ema12: emaSeries(closes, 12)[closes.length - 1] ?? price,
    ema26: emaSeries(closes, 26)[closes.length - 1] ?? price,
    rsi14: rsi(closes, 14),
    macd: m.macd,
    macdSignal: m.signal,
    macdHist: m.hist,
    atr14: a,
    atrPct: price ? (a / price) * 100 : 0,
    bbUpper,
    bbLower,
    bbPctB: bbUpper !== bbLower ? (price - bbLower) / (bbUpper - bbLower) : 0.5,
    donchian20High: Math.max(...(candles1d.slice(-21, -1).map((c) => c.high).length
      ? candles1d.slice(-21, -1).map((c) => c.high)
      : [price])),
    donchian20Low: Math.min(...(candles1d.slice(-21, -1).map((c) => c.low).length
      ? candles1d.slice(-21, -1).map((c) => c.low)
      : [price])),
    volZ: volSd ? (lastVol - volMean) / volSd : 0,
    ret1h: ret(1),
    ret24h: ret(24),
    ret7d: ret(24 * 7),
    ret30d: dailyCloses.length > 30 ? (price / dailyCloses[dailyCloses.length - 31] - 1) * 100 : ret(24 * 30),
    hh50: last50.length >= 20 && price >= Math.max(...last50),
    ll50: low50.length >= 20 && price <= Math.min(...low50),
  };
}
