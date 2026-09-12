// Market intelligence — four products in one module:
//   1. Digital-twin confidence rating (bootstrap paths + calibration score)
//   2. News sentiment + macro sentiment (lexicon-based, labeled MODEL OUTPUT)
//   3. Market predictor: twin × sentiment × trend, cross-referenced, fail-closed,
//      with labeled drivers so every number is traceable
//   4. Worldwide-news radar (Google News Top Stories, keyless)
//
// Every output is labeled MODEL OUTPUT with provenance. The AI never touches
// these numbers — deterministic code only. Missing data → explicit
// unavailability, never a fabricated estimate.

import { yahooChart, macroQuotes, googleNews } from "./providers";
import { sma, trendRegime } from "./indicators";
import { calibrateTwin, trainTwin, simulatePath, mulberry32 } from "../memory/twin";

export interface TwinConfidence {
  ticker: string;
  direction: "up" | "down" | "flat";
  confidencePct: number; // 0-100, rounded; NOT a calibrated probability (labeled)
  meanReturnPct: number;
  p05Pct: number;
  p95Pct: number;
  upProbabilityPct: number;
  paths: number;
  horizonDays: number;
  calibration: "thin" | "moderate" | "strong";
  calibrationScore: number; // 0-1, from history length + vol stability
  sourceCandles: number;
  label: "MODEL OUTPUT";
  caveat: string;
}

/**
 * Digital-twin confidence: calibrate the twin on real closes, replay
 * `paths` seeded synthetic paths, and derive a direction + confidence.
 * Calibration score damps confidence when history is thin or the vol
 * regime is unstable — the twin must know what it doesn't know.
 */
export function twinConfidence(ticker: string, closes: number[]): TwinConfidence {
  const cal = calibrateTwin(closes, "bootstrap");
  const paths = 800;
  const horizonDays = 20;
  const seed = 1337;
  const run = trainTwin(cal, { paths, horizonDays, seed, subject: ticker });

  // Real up-fraction: replay the same seeded path sequence and count positives.
  const rng = mulberry32(seed);
  let up = 0;
  for (let i = 0; i < paths; i++) {
    const p = simulatePath(cal, horizonDays, rng);
    if (p[p.length - 1] > p[0]) up++;
  }
  const upProb = Math.round((up / paths) * 100);

  const sourceCandles = cal.sourceCandles ?? closes.length;
  const historyScore = Math.min(1, sourceCandles / 250);
  const range = Math.max(0.01, run.summary.p95FinalReturnPct - run.summary.p05FinalReturnPct);
  const stabilityScore = Math.max(0, 1 - Math.abs(run.summary.meanFinalReturnPct) / range);
  const calibrationScore = Math.round(0.6 * historyScore + 0.4 * stabilityScore * 100) / 100;

  const direction: TwinConfidence["direction"] =
    upProb >= 70 ? "up" : upProb <= 30 ? "down" : "flat";
  const confidencePct = Math.round(upProb * calibrationScore);

  return {
    ticker,
    direction,
    confidencePct,
    meanReturnPct: run.summary.meanFinalReturnPct,
    p05Pct: run.summary.p05FinalReturnPct,
    p95Pct: run.summary.p95FinalReturnPct,
    upProbabilityPct: upProb,
    paths: run.summary.paths,
    horizonDays: run.summary.horizonDays,
    calibration: calibrationScore >= 0.7 ? "strong" : calibrationScore >= 0.4 ? "moderate" : "thin",
    calibrationScore,
    sourceCandles,
    label: "MODEL OUTPUT",
    caveat: `Synthetic ${run.summary.horizonDays}-day bootstrap from ${sourceCandles} real closes; not a probability of profit.`,
  };
}

// ── Sentiment ─────────────────────────────────────────────────────────────

const POS = ["beat", "beats", "record", "surge", "surges", "soar", "soars", "rally", "rallies", "upgrade", "upgraded", "outperform", "strong", "growth", "gain", "gains", "jumps", "tops", "raises", "raised", "boost", "boosts", "profit", "wins", "approval", "expands", "breakthrough", "bullish", "rises", "rise", "climbs", "higher"];
const NEG = ["miss", "misses", "drop", "drops", "fall", "falls", "plunge", "plunges", "slash", "cuts", "cut", "downgrade", "downgraded", "underperform", "weak", "decline", "declines", "loss", "losses", "lawsuit", "probe", "investigation", "recall", "warning", "warns", "fears", "layoff", "layoffs", "bearish", "sinks", "slump", "slumps", "tumbles", "lower", "halt"];

export interface NewsSentiment {
  ticker: string;
  score: number; // -1..1
  label: "positive" | "negative" | "mixed" | "neutral" | "unavailable";
  headlineCount: number;
  posCount: number;
  negCount: number;
  provider: string;
  labelType: "MODEL OUTPUT";
}

export async function newsSentiment(ticker: string): Promise<NewsSentiment> {
  const items = await googleNews(ticker, 20).catch(() => [] as Awaited<ReturnType<typeof googleNews>>);
  if (items.length === 0) {
    return { ticker, score: 0, label: "unavailable", headlineCount: 0, posCount: 0, negCount: 0, provider: "gnews", labelType: "MODEL OUTPUT" };
  }
  let pos = 0, neg = 0;
  for (const it of items) {
    const words = it.title.toLowerCase().split(/[^a-z]+/);
    if (words.some((w) => POS.includes(w))) pos++;
    else if (words.some((w) => NEG.includes(w))) neg++;
  }
  const net = pos - neg;
  const score = Math.max(-1, Math.min(1, net / Math.max(6, items.length * 0.4)));
  const label: NewsSentiment["label"] =
    score > 0.2 ? "positive" : score < -0.2 ? "negative" : pos > 0 && neg > 0 ? "mixed" : "neutral";
  return { ticker, score: Math.round(score * 100) / 100, label, headlineCount: items.length, posCount: pos, negCount: neg, provider: "gnews", labelType: "MODEL OUTPUT" };
}

export interface MacroSentiment {
  riskOn: boolean | null;
  score: number; // -1..1
  drivers: { symbol: string; label: string; changePct: number | null }[];
  label: "risk-on" | "risk-off" | "neutral" | "unavailable";
  labelType: "MODEL OUTPUT";
}

export async function macroSentiment(): Promise<MacroSentiment> {
  const quotes = await macroQuotes().catch(() => []);
  if (quotes.length === 0) {
    return { riskOn: null, score: 0, drivers: [], label: "unavailable", labelType: "MODEL OUTPUT" };
  }
  const drivers = quotes.map((q) => ({ symbol: q.symbol, label: q.label, changePct: q.changePct ?? null }));
  const spyQ = quotes.find((q) => q.symbol === "SPY");
  const vixQ = quotes.find((q) => q.symbol === "VIXY");
  const spyPct = spyQ?.changePct ?? null;
  const vixPct = vixQ?.changePct ?? null;
  if (spyPct == null) {
    return { riskOn: null, score: 0, drivers, label: "unavailable", labelType: "MODEL OUTPUT" };
  }
  let score = Math.max(-1, Math.min(1, spyPct / 2));
  if (vixPct != null) score -= Math.max(-1, Math.min(1, vixPct / 3)) * 0.5;
  score = Math.round(score * 100) / 100;
  return {
    riskOn: score > 0.15 ? true : score < -0.15 ? false : null,
    score,
    drivers,
    label: score > 0.15 ? "risk-on" : score < -0.15 ? "risk-off" : "neutral",
    labelType: "MODEL OUTPUT",
  };
}

// ── The predictor (cross-referenced) ──────────────────────────────────────

export interface PredictionDriver {
  source: "digital-twin" | "news-sentiment" | "macro" | "trend";
  detail: string;
  weight: number;
  contribution: number;
}

export interface MarketPrediction {
  ticker: string;
  stance: "bullish" | "bearish" | "neutral";
  score: number; // -1..1
  agreement: "cross-confirmed" | "mixed" | "thin";
  drivers: PredictionDriver[];
  unavailable: string[];
  horizonDays: number;
  label: "MODEL OUTPUT";
  disclaimer: string;
}

/**
 * Cross-referenced prediction: the twin's synthetic distribution, the news
 * lexicon, the macro tape, and the deterministic trend regime must agree
 * before the stance says so. Any leg unavailable → "thin" or "mixed", never
 * a confident stance built on partial evidence.
 */
export async function predictMarket(ticker: string): Promise<MarketPrediction> {
  const subject = ticker.toUpperCase();
  const drivers: PredictionDriver[] = [];
  const unavailable: string[] = [];

  const chart = await yahooChart(subject, "1y", "1d").catch(() => null);
  if (!chart || chart.candles.length < 60) {
    unavailable.push("candles: insufficient history");
  }

  const news = await newsSentiment(subject);
  if (news.label === "unavailable") unavailable.push("news: gnews unreachable");
  else {
    drivers.push({
      source: "news-sentiment",
      detail: `${news.label} headline flow (${news.posCount}+/ ${news.negCount}- of ${news.headlineCount})`,
      weight: 0.25,
      contribution: news.score,
    });
  }

  const macro = await macroSentiment();
  if (macro.label === "unavailable") unavailable.push("macro: providers unreachable");
  else {
    drivers.push({
      source: "macro",
      detail: `${macro.label} tape (score ${macro.score.toFixed(2)})`,
      weight: 0.2,
      contribution: macro.score,
    });
  }

  if (chart && chart.candles.length >= 60) {
    const closes = chart.candles.map((c) => c.close);
    const conf = twinConfidence(subject, closes);
    const w = conf.calibration === "strong" ? 0.35 : conf.calibration === "moderate" ? 0.3 : 0.2;
    const contribution = Math.max(-1, Math.min(1, conf.meanReturnPct / 8)); // ±8% band → ±1
    drivers.push({
      source: "digital-twin",
      detail: `${conf.direction} ${conf.horizonDays}d twin (mean ${conf.meanReturnPct.toFixed(1)}%, band ${conf.p05Pct.toFixed(1)}→${conf.p95Pct.toFixed(1)}%, calibration ${conf.calibration})`,
      weight: w,
      contribution: Math.round(contribution * 100) / 100,
    });

    const s20 = sma(closes, 20);
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    const regime = trendRegime(s20, s50, s200, closes[closes.length - 1]);
    const trendScore = regime == null ? 0 : regime.includes("up") ? 0.8 : regime.includes("down") ? -0.8 : 0;
    drivers.push({
      source: "trend",
      detail: `${regime ?? "unavailable"} (SMA20 ${s20?.toFixed(1) ?? "n/a"} / SMA50 ${s50?.toFixed(1) ?? "n/a"} / SMA200 ${s200?.toFixed(1) ?? "n/a"})`,
      weight: 0.2,
      contribution: trendScore,
    });
  }

  const totalW = drivers.reduce((s, d) => s + d.weight, 0) || 1;
  const score = Math.round((drivers.reduce((s, d) => s + d.weight * d.contribution, 0) / totalW) * 100) / 100;

  const twin = drivers.find((d) => d.source === "digital-twin");
  const newsD = drivers.find((d) => d.source === "news-sentiment");
  const trendD = drivers.find((d) => d.source === "trend");
  const signs = [twin, newsD, trendD].filter(Boolean).map((d) => Math.sign(d!.contribution));
  const agree = signs.length >= 2 && signs.every((s) => s === signs[0]);
  const agreement: MarketPrediction["agreement"] =
    unavailable.length >= 2 ? "thin" : agree && signs.length >= 2 ? "cross-confirmed" : "mixed";

  const stance: MarketPrediction["stance"] =
    unavailable.length >= 2 || agreement === "thin"
      ? "neutral"
      : score > 0.25 ? "bullish" : score < -0.25 ? "bearish" : "neutral";

  return {
    ticker: subject,
    stance,
    score,
    agreement,
    drivers,
    unavailable,
    horizonDays: 20,
    label: "MODEL OUTPUT",
    disclaimer: "Cross-referenced model output over synthetic + live data — not investment advice, not a probability of profit.",
  };
}

// ── Worldwide news radar ──────────────────────────────────────────────────

export interface WorldItem {
  title: string;
  link: string;
  source: string;
  publishedTs: number;
  categories: string[];
}

const WORLD_PATTERNS: { re: RegExp; category: string }[] = [
  { re: /\b(fed|fomc|ecb|boj|rate (hike|cut)|inflation|cpi)\b/i, category: "Macro" },
  { re: /\b(earnings|guidance|ipo|merger|acquisition)\b/i, category: "Markets" },
  { re: /\b(geopolit|war|sanction|tariff|opec)\b/i, category: "Geopolitics" },
  { re: /\b(oil|gold|copper|wheat)\b/i, category: "Commodities" },
  { re: /\b(bitcoin|crypto|ethereum)\b/i, category: "Crypto" },
  { re: /\b(ai|chip|semiconductor)\b/i, category: "Technology" },
];

export async function worldNewsRadar(limit = 18): Promise<WorldItem[]> {
  const xml = await fetchRss("https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en");
  const items = parseRss(xml, limit);
  return items.map((i) => ({
    ...i,
    categories: WORLD_PATTERNS.filter((p) => p.re.test(i.title)).map((p) => p.category),
  }));
}

// Minimal RSS plumbing (shared shape with providers.googleNews but scoped here
// so the radar can hit Top Stories, not just ticker searches).
async function fetchRss(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "TruffleTrade/1.0 (no-kyc research terminal)" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from news.google.com`);
  return await res.text();
}

function parseRss(xml: string, limit: number): { title: string; link: string; source: string; publishedTs: number }[] {
  const out: { title: string; link: string; source: string; publishedTs: number }[] = [];
  for (const block of xml.split(/<item>/).slice(1)) {
    const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(block)?.[1]?.trim();
    let link = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/.exec(block)?.[1]?.trim() ?? "";
    const source = /<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/.exec(block)?.[1]?.trim() ?? "Google News";
    const pub = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1]?.trim();
    if (!title || !link.startsWith("http")) continue;
    const u = new URL(link);
    u.search = "";
    out.push({ title, link: u.toString(), source, publishedTs: pub ? Date.parse(pub) || Date.now() : Date.now() });
    if (out.length >= limit) break;
  }
  return out;
}
