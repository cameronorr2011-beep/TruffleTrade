// Fact-checking layer (spec §9). Extract numeric claims from agent prose,
// verify each against the deterministic data pack, and strip what fails.
// The LLM never gets the final word on numbers.

import type { AgentOutput, DataPack, FactCheckViolation, NumericClaim } from "./types";

/** Every number the AI is allowed to cite, with tolerance for rounding. */
export function metricTable(pack: DataPack): Record<string, number> {
  const t: Record<string, number> = {};
  const q = pack.quote;
  if (q.price != null) t.price = q.price;
  if (q.changePct != null) t.changePct = q.changePct;
  if (q.marketCap != null) t.marketCap = q.marketCap;
  if (q.fiftyTwoWeekHigh != null) t.fiftyTwoWeekHigh = q.fiftyTwoWeekHigh;
  if (q.fiftyTwoWeekLow != null) t.fiftyTwoWeekLow = q.fiftyTwoWeekLow;
  const tech = pack.technicals;
  if (tech.sma20 != null) t.sma20 = tech.sma20;
  if (tech.sma50 != null) t.sma50 = tech.sma50;
  if (tech.sma200 != null) t.sma200 = tech.sma200;
  if (tech.rsi14 != null) t.rsi14 = tech.rsi14;
  if (tech.macdHist != null) t.macdHist = tech.macdHist;
  if (tech.atrPct != null) t.atrPct = tech.atrPct;
  if (tech.realizedVol20Pct != null) t.realizedVol20Pct = tech.realizedVol20Pct;
  if (tech.maxDrawdown30dPct != null) t.maxDrawdown30dPct = tech.maxDrawdown30dPct;
  if (tech.support != null) t.support = tech.support;
  if (tech.resistance != null) t.resistance = tech.resistance;
  if (tech.relStrengthVsSpy30d != null) t.relStrengthVsSpy30d = tech.relStrengthVsSpy30d;
  if (tech.ret1mPct != null) t.ret1mPct = tech.ret1mPct;
  if (tech.ret3mPct != null) t.ret3mPct = tech.ret3mPct;
  if (tech.ret12mPct != null) t.ret12mPct = tech.ret12mPct;
  if (tech.volumeZ != null) t.volumeZ = tech.volumeZ;
  const f = pack.fundamentals;
  if (f) {
    if (f.peTtm != null) t.peTtm = f.peTtm;
    if (f.forwardPe != null) t.forwardPe = f.forwardPe;
    if (f.epsTtm != null) t.epsTtm = f.epsTtm;
    if (f.revenueTtm != null) t.revenueTtm = f.revenueTtm;
    if (f.netIncomeTtm != null) t.netIncomeTtm = f.netIncomeTtm;
    if (f.fcfTtm != null) t.fcfTtm = f.fcfTtm;
    if (f.grossMarginPct != null) t.grossMarginPct = f.grossMarginPct;
    if (f.operatingMarginPct != null) t.operatingMarginPct = f.operatingMarginPct;
    if (f.netMarginPct != null) t.netMarginPct = f.netMarginPct;
    if (f.beta != null) t.beta = f.beta;
    if (f.revenueGrowthYoYPct != null) t.revenueGrowthYoYPct = f.revenueGrowthYoYPct;
    if (f.dividendYieldPct != null) t.dividendYieldPct = f.dividendYieldPct;
  }
  return t;
}

/**
 * Extract numeric claims from text. A claim is a number that follows a metric
 * phrase through connector tokens only ("is", "at", "of", punctuation).
 * "price is above SMA20" must NOT read 20 as the price — the walk stops at
 * "above" (a content word), and numbers inside identifiers (SMA20, RSI14)
 * are never extracted. Under-extraction is acceptable; false flags are not.
 */
export function extractClaims(text: string, pack: DataPack): NumericClaim[] {
  const aliases: Record<string, string[]> = {
    price: ["price", "trading at", "trades at", "per share"],
    changePct: ["change", "move", "gain", "loss"],
    rsi14: ["rsi"],
    sma20: ["sma20", "sma 20", "20d", "20 day"],
    sma50: ["sma50", "sma 50", "50d", "50 day"],
    sma200: ["sma200", "sma 200", "200d", "200 day"],
    peTtm: ["p/e", "pe ratio", "price-to-earnings", "trailing p/e"],
    forwardPe: ["forward p/e", "forward pe"],
    epsTtm: ["eps"],
    grossMarginPct: ["gross margin"],
    operatingMarginPct: ["operating margin"],
    netMarginPct: ["net margin"],
    revenueGrowthYoYPct: ["revenue growth"],
    realizedVol20Pct: ["realized vol", "annualized vol", "volatility"],
    relStrengthVsSpy30d: ["relative strength", "outperformance", "underperformance"],
    beta: ["beta"],
  };
  const CONNECTOR_WORDS = new Set(["is", "was", "at", "of", "about", "around", "near", "roughly", "and", "currently", "now"]);
  const NUMERIC = /^-?\$?\d[\d,]*(?:\.\d+)?%?$/;
  const claims: NumericClaim[] = [];
  const lower = text.toLowerCase();

  const pushClaim = (metric: string, token: string) => {
    const statedPct = token.includes("%");
    const isPctMetric = metric.toLowerCase().includes("pct") || metric === "rsi14" || metric === "changePct";
    // Percent metrics must claim a percent-shaped number; dollar metrics a bare one.
    if (isPctMetric ? statedPct || metric === "rsi14" : !statedPct) {
      const value = Number(token.replace(/[$,%]/g, "").replace(/,/g, ""));
      if (Number.isFinite(value)) claims.push({ metric, value, text: token, evidenceIds: [] });
    }
  };

  for (const [metric, phrases] of Object.entries(aliases)) {
    for (const phrase of phrases) {
      let idx = lower.indexOf(phrase);
      while (idx !== -1) {
        let pos = idx + phrase.length;
        // Walk at most 5 tokens: numbers, connectors, or punctuation.
        for (let hop = 0; hop < 5; hop++) {
          while (pos < text.length && /\s/.test(text[pos])) pos++; // skip whitespace first
          const m = /^\S+/.exec(text.slice(pos));
          if (!m) break;
          const token = m[0].replace(/[,;:!?)\]]+$/, ""); // trailing prose punctuation
          if (!token) break;
          if (NUMERIC.test(token)) {
            pushClaim(metric, token);
            break;
          }
          const word = token.replace(/[^a-z]/g, "");
          if (!word || CONNECTOR_WORDS.has(word)) {
            pos += token.length;
            continue;
          }
          break; // content word — anything numeric here belongs to it, not us
        }
        idx = lower.indexOf(phrase, idx + phrase.length);
      }
    }
  }
  return claims;
}

/** Tolerances: rounding in prose is fine; wrong magnitudes are not. */
function withinTolerance(metric: string, stated: number, actual: number): boolean {
  const abs = Math.abs(actual);
  if (metric === "rsi14") return Math.abs(stated - actual) <= 2;
  if (abs >= 1000) return Math.abs(stated - actual) / abs <= 0.03; // 3% for big numbers
  if (abs >= 10) return Math.abs(stated - actual) / abs <= 0.05;
  return Math.abs(stated - actual) <= Math.max(0.5, abs * 0.1);
}

export function factCheckAgent(a: AgentOutput, pack: DataPack): { violations: FactCheckViolation[]; claims: NumericClaim[] } {
  const table = metricTable(pack);
  const text = [a.rationale, ...a.strengths, ...a.weaknesses, ...a.assumptions].join(" ");
  const claims = extractClaims(text, pack);
  const violations: FactCheckViolation[] = [];
  const stale = pack.quote.asOf != null && Date.now() - pack.quote.asOf > 7 * 86_400_000;

  for (const c of claims) {
    const actual = table[c.metric];
    if (actual == null) {
      // The AI cited a number for a metric we don't have — that's a fabricated figure.
      violations.push({
        claim: `${c.metric}: ${c.text}`,
        metric: c.metric,
        stated: c.value,
        actual: null,
        reason: "unsupported-number",
        detail: `metric unavailable in data pack; agent stated ${c.text} anyway`,
      });
    } else if (!withinTolerance(c.metric, c.value, actual)) {
      violations.push({
        claim: `${c.metric}: ${c.text}`,
        metric: c.metric,
        stated: c.value,
        actual: Math.round(actual * 100) / 100,
        reason: "contradicted",
        detail: `agent stated ${c.text}, data pack says ${actual.toFixed(2)}`,
      });
    }
  }
  if (stale) {
    violations.push({
      claim: "market data freshness",
      metric: null,
      stated: null,
      actual: pack.quote.asOf,
      reason: "stale-data",
      detail: `quote as-of ${new Date(pack.quote.asOf as number).toISOString()} is more than 7 days old`,
    });
  }
  return { violations, claims };
}

/** Strip violated claims from prose so unsupported numbers never reach the report. */
export function stripViolatedNumbers(text: string, violations: FactCheckViolation[]): string {
  let out = text;
  for (const v of violations) {
    if (v.reason !== "unsupported-number" && v.reason !== "contradicted") continue;
    if (v.stated == null) continue;
    // Word boundaries keep \b20\b from matching inside identifiers like SMA20.
    const esc = String(v.stated).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`\\$?${esc}%`, "g"),
      new RegExp(`\\$${esc}\\b`, "g"),
      new RegExp(`\\b${esc}\\b`, "g"),
    ];
    for (const p of patterns) out = out.replace(p, "[number removed: unverified]");
  }
  return out;
}
