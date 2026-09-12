// Twin simulation for the AI Analyst tab: calibrate the digital twin on the
// ticker's real daily closes, replay seeded synthetic paths forward from the
// live price, and return per-day percentile bands. Deterministic (fixed seed
// per ticker+horizon), labeled MODEL OUTPUT, never a promise of performance.

import { yahooChart } from "./providers";
import { calibrateTwin, simulatePath, mulberry32, trainTwin } from "../memory/twin";

export interface SimBand {
  day: number;
  p10: number;
  p25: number;
  med: number;
  p75: number;
  p90: number;
}

export interface SimulationResult {
  ticker: string;
  lastPrice: number;
  days: number;
  paths: number;
  bands: SimBand[];
  meanReturnPct: number;
  p05Pct: number;
  p95Pct: number;
  upProbabilityPct: number;
  maxDrawdownPct: number;
  sourceCandles: number;
  sigmaDailyPct: number;
  label: "MODEL OUTPUT";
  caveat: string;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx];
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function runSimulation(ticker: string, days = 20, paths = 60): Promise<SimulationResult> {
  const { candles } = await yahooChart(ticker.toUpperCase(), "2y", "1d");
  const closes = candles.map((c) => c.close);
  if (closes.length < 30) throw new Error(`need 30+ daily closes, got ${closes.length}`);

  const cal = calibrateTwin(closes, "bootstrap");
  const seed = hashSeed(`${ticker.toUpperCase()}:${days}`);
  const rng = mulberry32(seed);

  const perDay: number[][] = Array.from({ length: days + 1 }, () => []);
  for (let p = 0; p < paths; p++) {
    const path = simulatePath(cal, days, rng);
    for (let t = 0; t < Math.min(path.length, days + 1); t++) perDay[t].push(path[t]);
  }

  const bands: SimBand[] = perDay.map((vals, day) => {
    const sorted = [...vals].sort((a, b) => a - b);
    return {
      day,
      p10: Math.round(quantile(sorted, 0.1) * 100) / 100,
      p25: Math.round(quantile(sorted, 0.25) * 100) / 100,
      med: Math.round(quantile(sorted, 0.5) * 100) / 100,
      p75: Math.round(quantile(sorted, 0.75) * 100) / 100,
      p90: Math.round(quantile(sorted, 0.9) * 100) / 100,
    };
  });

  // Summary stats from a larger replay for stable percentiles.
  const big = trainTwin(cal, { paths: 500, horizonDays: days, seed, subject: ticker });
  let up = 0;
  const bigRng = mulberry32(seed + 1);
  for (let i = 0; i < 500; i++) {
    const p = simulatePath(cal, days, bigRng);
    if (p[p.length - 1] > p[0]) up++;
  }

  const lastPrice = cal.startPrice;
  return {
    ticker: ticker.toUpperCase(),
    lastPrice: Math.round(lastPrice * 100) / 100,
    days,
    paths,
    bands,
    meanReturnPct: big.summary.meanFinalReturnPct,
    p05Pct: big.summary.p05FinalReturnPct,
    p95Pct: big.summary.p95FinalReturnPct,
    upProbabilityPct: Math.round((up / 500) * 100),
    maxDrawdownPct: big.summary.maxDrawdownPct,
    sourceCandles: cal.sourceCandles,
    sigmaDailyPct: Math.round(cal.sigmaDaily * 100 * 100) / 100,
    label: "MODEL OUTPUT",
    caveat: `${paths}-path block-bootstrap replay calibrated on ${cal.sourceCandles} real daily closes (σ=${(cal.sigmaDaily * 100).toFixed(2)}%/day). Synthetic scenarios — not a prediction, not investment advice.`,
  };
}
