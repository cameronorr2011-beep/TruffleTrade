// Digital-twin trainer for TruffleTrade Memory.
// A "twin" is a lightweight stochastic market simulator seeded from real
// historical candles. We replay thousands of synthetic regimes through it,
// extract regularities, and store them as memory facts — so the system builds
// priors about how indicators behave in each regime without inventing data.
//
// Twin models available:
//  - "gbm":      geometric Brownian motion (calibrated μ, σ from history)
//  - "bootstrap": block-bootstrap of actual historical returns (keeps fat tails)
// Both are seeded/deterministic when given a seed, so runs are reproducible.

export interface TwinCandle {
  ts: number;
  close: number;
  volume: number;
}

export interface TwinCalibration {
  model: "gbm" | "bootstrap";
  muDaily: number; // mean daily log return
  sigmaDaily: number; // daily log-return stdev
  startPrice: number;
  blocks: number[][]; // for bootstrap: windows of log-returns
  sourceCandles: number;
}

export interface TwinRunSummary {
  model: string;
  seed: number;
  paths: number;
  horizonDays: number;
  regimes: Record<string, number>;
  meanFinalReturnPct: number;
  p05FinalReturnPct: number;
  p95FinalReturnPct: number;
  maxDrawdownPct: number;
}

// ── Calibration ────────────────────────────────────────────────────────────

export function calibrateTwin(closes: number[], model: "gbm" | "bootstrap" = "bootstrap"): TwinCalibration {
  if (closes.length < 30) throw new Error("twin calibration needs >= 30 closes");
  const logRets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) logRets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const n = logRets.length;
  const mu = logRets.reduce((s, x) => s + x, 0) / n;
  const variance = logRets.reduce((s, x) => s + (x - mu) ** 2, 0) / Math.max(1, n - 1);
  const sigma = Math.sqrt(variance);
  const blocks: number[][] = [];
  if (model === "bootstrap") {
    const blockLen = 5;
    for (let i = 0; i + blockLen <= n; i += blockLen) {
      blocks.push(logRets.slice(i, i + blockLen));
    }
  }
  return { model, muDaily: mu, sigmaDaily: sigma, startPrice: closes[closes.length - 1], blocks, sourceCandles: closes.length };
}

// ── Deterministic PRNG (mulberry32) ───────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  // Box-Muller
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Path generation ───────────────────────────────────────────────────────

export function simulatePath(cal: TwinCalibration, horizonDays: number, rng: () => number): number[] {
  const path: number[] = [cal.startPrice];
  if (cal.model === "gbm") {
    for (let d = 0; d < horizonDays; d++) {
      const r = cal.muDaily + cal.sigmaDaily * gauss(rng);
      path.push(Math.max(0.01, path[path.length - 1] * Math.exp(r)));
    }
  } else {
    while (path.length - 1 < horizonDays) {
      const block = cal.blocks[Math.floor(rng() * cal.blocks.length)] ?? [0];
      for (const r of block) {
        if (path.length - 1 >= horizonDays) break;
        path.push(Math.max(0.01, path[path.length - 1] * Math.exp(r)));
      }
    }
  }
  return path;
}

function maxDrawdownPct(path: number[]): number {
  let peak = path[0];
  let mdd = 0;
  for (const p of path) {
    if (p > peak) peak = p;
    const dd = (peak - p) / peak;
    if (dd > mdd) mdd = dd;
  }
  return mdd * 100;
}

// ── The trainer: run the twin, distill regularities into facts ────────────

export interface TwinTrainingResult {
  summary: TwinRunSummary;
  facts: string[]; // human-readable regularities, ready for memory ingestion
}

export function trainTwin(
  cal: TwinCalibration,
  opts: { paths?: number; horizonDays?: number; seed?: number; subject?: string } = {},
): TwinTrainingResult {
  const paths = opts.paths ?? 500;
  const horizonDays = opts.horizonDays ?? 20;
  const seed = opts.seed ?? 1337;
  const rng = mulberry32(seed);
  const subject = (opts.subject ?? "TWIN").toUpperCase();

  const finals: number[] = [];
  let worstDd = 0;
  const regimes: Record<string, number> = {};

  for (let i = 0; i < paths; i++) {
    const path = simulatePath(cal, horizonDays, rng);
    const retPct = (path[path.length - 1] / path[0] - 1) * 100;
    finals.push(retPct);
    const dd = maxDrawdownPct(path);
    if (dd > worstDd) worstDd = dd;
    const volPct = cal.sigmaDaily * 100;
    const trendPct = retPct;
    const key =
      volPct > 3 ? (trendPct > 2 ? "volatile-uptrend" : trendPct < -2 ? "volatile-downtrend" : "high-vol") : trendPct > 2 ? "calm-uptrend" : trendPct < -2 ? "calm-downtrend" : "calm";
    regimes[key] = (regimes[key] ?? 0) + 1;
  }

  finals.sort((a, b) => a - b);
  const pct = (p: number) => finals[Math.min(finals.length - 1, Math.floor(p * finals.length))] ?? 0;
  const mean = finals.reduce((s, x) => s + x, 0) / finals.length;
  const upProb = finals.filter((r) => r > 0).length / finals.length;

  const facts: string[] = [
    `twin ${cal.model} model over ${paths} synthetic ${horizonDays}d paths: mean return ${mean.toFixed(2)}%, P05 ${pct(0.05).toFixed(2)}%, P95 ${pct(0.95).toFixed(2)}%`,
    `twin ${cal.model} model: probability of positive ${horizonDays}d return ${Math.round(upProb * 100)}% (calibrated on ${cal.sourceCandles} real closes)`,
    `twin ${cal.model} model: worst simulated drawdown ${worstDd.toFixed(1)}% across ${paths} paths`,
    `twin regime mix: ${Object.entries(regimes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ${Math.round((v / paths) * 100)}%`)
      .join(", ")}`,
  ];

  const summary: TwinRunSummary = {
    model: cal.model,
    seed,
    paths,
    horizonDays,
    regimes,
    meanFinalReturnPct: Math.round(mean * 100) / 100,
    p05FinalReturnPct: Math.round(pct(0.05) * 100) / 100,
    p95FinalReturnPct: Math.round(pct(0.95) * 100) / 100,
    maxDrawdownPct: Math.round(worstDd * 10) / 10,
  };
  return { summary, facts };
}
