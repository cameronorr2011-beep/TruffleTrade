// Thesis engine (§11) + scenario engine (§12): base/bull/bear/extreme-bear,
// measurable invalidation conditions, probability-aware scenarios.

import type {
  AgentOutput,
  ConsensusResult,
  DataPack,
  InvalidationCondition,
  Scenario,
  Stance,
  Thesis,
  ValuationModel,
} from "./types";
import { metricTable } from "./factcheck";
import type { AIProvider } from "./ai";

interface RawThesisJson {
  summary?: string;
  baseCase?: string;
  bullCase?: string;
  bearCase?: string;
  extremeBearCase?: string;
  invalidation?: { condition?: string; metric?: string; threshold?: number; operator?: string; basis?: string }[];
  scenarios?: {
    name?: string;
    probabilityPct?: number;
    assumptions?: string[];
    drivers?: string[];
    risks?: string[];
    impliedMovePct?: number;
  }[];
}

const THESIS_PROMPT_VERSION = "thesis-engine-v1.0";

const THESIS_SYSTEM =
  "You are the THESIS ENGINE. Using ONLY the council outputs and data provided, draft the investment thesis. " +
  "Produce a base case, bull case, bear case, extreme bear case, measurable invalidation conditions, and scenarios. " +
  "Invalidation metrics MUST come from this list: " +
  "price, rsi14, sma20, sma50, sma200, peTtm, forwardPe, grossMarginPct, operatingMarginPct, netMarginPct, " +
  "revenueGrowthYoYPct, realizedVol20Pct, relStrengthVsSpy30d, ret3mPct. " +
  "Thresholds must be derived from the current values shown (e.g. 'margin compression below 2/3 of current gross margin'), " +
  "not arbitrary. Probabilities across bull/base/bear must sum to 100. " +
  "LANGUAGE: use 'model scenario', 'evidence suggests'. Never promise or predict with certainty. " +
  'Respond ONLY with JSON: {"summary":"<=3 sentences","baseCase":"<=3 sentences","bullCase":"<=2 sentences",' +
  '"bearCase":"<=2 sentences","extremeBearCase":"<=2 sentences","invalidation":[{"condition":"...","metric":"peTtm",' +
  '"threshold":<number>,"operator":"<"|">","basis":"why this threshold"}], "scenarios":[{"name":"bull"|"base"|"bear",' +
  '"probabilityPct":<number>,"assumptions":["..."],"drivers":["..."],"risks":["..."],"impliedMovePct":<number or null>}]}';

export async function buildThesis(
  provider: AIProvider,
  pack: DataPack,
  agents: AgentOutput[],
  consensus: ConsensusResult,
  valuation: ValuationModel,
): Promise<Thesis> {
  const table = metricTable(pack);
  const agentJson = JSON.stringify(
    agents.map((a) => ({
      agent: a.agent,
      stance: a.stance,
      confidence: a.confidence,
      rationale: a.rationale,
      strengths: a.strengths,
      weaknesses: a.weaknesses,
      assumptions: a.assumptions,
      objections: a.violations.map((v) => v.claim),
    })),
  );
  const user =
    `Ticker: ${pack.ticker}\nData summary: price ${table.price ?? "unavailable"}, RSI14 ${table.rsi14 ?? "unavailable"}, ` +
    `P/E ${table.peTtm ?? "unavailable"}, forward P/E ${table.forwardPe ?? "unavailable"}, ` +
    `gross margin ${table.grossMarginPct ?? "unavailable"}%, operating margin ${table.operatingMarginPct ?? "unavailable"}%, ` +
    `revenue growth ${table.revenueGrowthYoYPct ?? "unavailable"}%.\n\n` +
    `Valuation model output:\n${valuationSummary(valuation)}\n\n` +
    `Council outputs:\n${agentJson}\n\nConsensus: ${consensus.stance} (score ${consensus.score}).\n` +
    `Draft the thesis.`;

  try {
    const r = await provider.chatJson<RawThesisJson>(
      [
        { role: "system", content: THESIS_SYSTEM },
        { role: "user", content: user },
      ],
      THESIS_PROMPT_VERSION,
      2600,
    );
    const d = r.data;
    const invalidation = sanitizeInvalidation(d.invalidation, table);
    const scenarios = sanitizeScenarios(d.scenarios, consensus.stance);
    return {
      ticker: pack.ticker,
      stance: consensus.stance,
      summary: String(d.summary ?? "").slice(0, 900) || "Thesis generation returned no summary.",
      baseCase: String(d.baseCase ?? "").slice(0, 900) || "Not provided.",
      bullCase: String(d.bullCase ?? "").slice(0, 600) || "Not provided.",
      bearCase: String(d.bearCase ?? "").slice(0, 600) || "Not provided.",
      extremeBear: String(d.extremeBearCase ?? "").slice(0, 600) || "Not provided.",
      invalidationConditions: invalidation,
      scenarios,
      confidence: emptyConfidence(),
    };
  } catch (err) {
    return {
      ticker: pack.ticker,
      stance: consensus.stance,
      summary: `Thesis generation failed: ${(err as Error).message}. Council outputs remain available above; no thesis is issued.`,
      baseCase: "Not available (thesis generation failed).",
      bullCase: "Not available.",
      bearCase: "Not available.",
      extremeBear: "Not available.",
      invalidationConditions: [],
      scenarios: [],
      confidence: emptyConfidence(),
    };
  }
}

/** Thesis stub when the red team rejects — honest "no thesis" instead of a forced conclusion. */
export function nullThesis(ticker: string, stance: Stance): Thesis {
  return {
    ticker,
    stance,
    summary:
      "REJECTED BY RED TEAM: the evidence base is insufficient to support any investment thesis. " +
      "Per the adversarial design, no thesis is issued rather than forcing a bullish/bearish conclusion.",
    baseCase: "Not issued — insufficient evidence.",
    bullCase: "Not issued.",
    bearCase: "Not issued.",
    extremeBear: "Not issued.",
    invalidationConditions: [],
    scenarios: [],
    confidence: emptyConfidence(),
  };
}

function emptyConfidence(): Thesis["confidence"] {
  return {
    level: "low",
    dataCompleteness: 0,
    sourceQuality: 0,
    recency: 0,
    agreement: 0,
    contradiction: 0,
    breakdown: ["see run-level confidence report"],
  };
}

function valuationSummary(v: ValuationModel): string {
  if (v.dcf) {
    const a = v.dcf.assumptions;
    return `DCF fair value ${v.dcf.fairValue} (assumes ${(a.growthYears1to5 * 100).toFixed(1)}% growth 1-5y, ${(a.growthTerminal * 100).toFixed(1)}% terminal, ${(a.discountRate * 100).toFixed(1)}% discount). Reverse DCF: ${
      v.reverseDcf ? `${(v.reverseDcf.impliedGrowthYears1to5 * 100).toFixed(1)}% implied growth` : "not solvable"
    }.`;
  }
  return `DCF not applicable: ${v.dcfError ?? "insufficient inputs"}.`;
}

const ALLOWED_METRICS = new Set([
  "price", "rsi14", "sma20", "sma50", "sma200", "peTtm", "forwardPe",
  "grossMarginPct", "operatingMarginPct", "netMarginPct", "revenueGrowthYoYPct",
  "realizedVol20Pct", "relStrengthVsSpy30d", "ret3mPct",
]);

export function sanitizeInvalidation(
  raw: RawThesisJson["invalidation"],
  table: Record<string, number>,
): InvalidationCondition[] {
  if (!Array.isArray(raw)) return [];
  const out: InvalidationCondition[] = [];
  for (const c of raw.slice(0, 5)) {
    const metric = String(c?.metric ?? "");
    if (!ALLOWED_METRICS.has(metric)) continue;
    const threshold = Number(c?.threshold);
    const op = c?.operator === ">" ? ">" : "<";
    if (!Number.isFinite(threshold)) continue;
    const basis = String(c?.basis ?? "").slice(0, 300) || "threshold derived from current values";
    const cur = table[metric];
    out.push({
      condition: String(c?.condition ?? "").slice(0, 300) || `${metric} ${op} ${threshold}`,
      metric,
      threshold: Math.round(threshold * 100) / 100,
      operator: op,
      basis: cur != null ? `${basis} (current: ${Math.round(cur * 100) / 100})` : basis,
    });
  }
  return out;
}

function sanitizeScenarios(raw: RawThesisJson["scenarios"], stance: Stance): Scenario[] {
  if (!Array.isArray(raw)) return [];
  const allowed: Scenario["name"][] = ["bull", "base", "bear"];
  const out: Scenario[] = [];
  for (const s of raw.slice(0, 4)) {
    const name = String(s?.name ?? "").toLowerCase() as Scenario["name"];
    if (!allowed.includes(name)) continue;
    const prob = Number(s?.probabilityPct);
    out.push({
      name,
      probabilityPct: Number.isFinite(prob) ? Math.min(95, Math.max(1, Math.round(prob))) : name === "base" ? 50 : 25,
      assumptions: (s?.assumptions ?? []).map((x) => String(x).slice(0, 200)).slice(0, 5),
      drivers: (s?.drivers ?? []).map((x) => String(x).slice(0, 200)).slice(0, 5),
      risks: (s?.risks ?? []).map((x) => String(x).slice(0, 200)).slice(0, 5),
      impliedMovePct: Number.isFinite(Number(s?.impliedMovePct)) ? Number(s?.impliedMovePct) : null,
    });
  }
  // Normalize probabilities to 100 when all three scenarios present.
  const three = out.filter((s) => s.name !== "extreme-bear");
  const total = three.reduce((sum, s) => sum + s.probabilityPct, 0);
  if (three.length === 3 && total > 0) {
    for (const s of three) s.probabilityPct = Math.round((s.probabilityPct / total) * 100);
  }
  void stance;
  return out;
}
