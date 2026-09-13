// TruffleTrade research domain — evidence-first types.
// Every analytical statement traces to evidence; every number must be verifiable.

export type Stance =
  | "bullish"
  | "bearish"
  | "neutral"
  | "caution"
  | "insufficient-evidence";

export type SourceType = "primary" | "secondary" | "derived";

/** A single provenance-backed fact used by agents. */
export interface Evidence {
  id: string; // "ev-1", stable within a run
  claim: string;
  source: string; // e.g. "yahoo:chart:AAPL"
  sourceType: SourceType;
  publicationDate: string | null; // ISO date when the source published, if known
  retrievalTs: number;
  dataTimestamp: number | null; // market-data timestamp
  confidence: number; // 0..1 — how much we trust this evidence
  agent: string; // who produced/consumed it ("engine" for base data)
  calculation?: string; // deterministic formula used, for derived evidence
}

/** A numeric assertion made by an agent that must verify against the data pack. */
export interface NumericClaim {
  metric: string; // key into DataPack symbol table, e.g. "rsi14"
  value: number;
  text: string; // the claim as written
  evidenceIds: string[];
}

export interface FactCheckViolation {
  claim: string;
  metric: string | null;
  stated: number | null;
  actual: number | null;
  reason: "unsupported-number" | "stale-data" | "contradicted" | "unverifiable";
  detail: string;
}

export interface AgentOutput {
  agent: string;
  promptVersion: string;
  stance: Stance;
  confidence: number; // self-reported 0..1 — downgraded by fact-check
  rationale: string;
  evidence: Evidence[];
  numericClaims: NumericClaim[];
  strengths: string[];
  weaknesses: string[];
  assumptions: string[];
  violations: FactCheckViolation[];
  model: string;
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedTs: number | null;
  retrievedTs: number;
}

export interface Quote {
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string;
  price: number | null;
  prevClose: number | null;
  changePct: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  asOf: number | null;
  source: string;
}

export interface Technicals {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macdHist: number | null;
  atr14: number | null;
  atrPct: number | null;
  realizedVol20Pct: number | null;
  maxDrawdown30dPct: number | null;
  support: number | null;
  resistance: number | null;
  trendRegime: "uptrend" | "downtrend" | "range" | null;
  relStrengthVsSpy30d: number | null;
  ret1mPct: number | null;
  ret3mPct: number | null;
  ret12mPct: number | null;
  volumeZ: number | null;
  bars: number;
  asOf: number | null;
}

/** Fundamentals — every field independently optional; missing = DATA UNAVAILABLE. */
export interface Fundamentals {
  currency: string;
  revenueTtm: number | null;
  ebitdaTtm: number | null;
  netIncomeTtm: number | null;
  fcfTtm: number | null;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  netMarginPct: number | null;
  roicPct: number | null;
  totalDebt: number | null;
  cash: number | null;
  sharesOutstanding: number | null;
  peTtm: number | null;
  forwardPe: number | null;
  evEbitda: number | null;
  epsTtm: number | null;
  beta: number | null;
  dividendYieldPct: number | null;
  revenueGrowthYoYPct: number | null;
  asOf: number | null;
  source: string | null;
}

export interface MacroPoint {
  symbol: string;
  label: string;
  price: number | null;
  changePct: number | null;
  asOf: number | null;
}

export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DataPack {
  ticker: string;
  quote: Quote;
  candles1d: Candle[];
  technicals: Technicals;
  fundamentals: Fundamentals | null; // null → DATA UNAVAILABLE
  fundamentalsError: string | null;
  news: NewsItem[];
  macro: MacroPoint[];
  spyCloses: number[];
  street: StreetRatings | null; // sell-side consensus; null → unavailable (third-party opinion)
  retrievalTs: number;
  sources: string[];
  availability: Record<string, boolean>; // per-section availability map
}

/** Sell-side consensus shape (from ./providers). Re-declared structurally to avoid a circular import. */
export interface StreetRatings {
  ticker: string;
  buy: number;
  overweight: number;
  hold: number;
  underweight: number;
  sell: number;
  total: number;
  consensus: "buy" | "overweight" | "hold" | "underweight" | "sell" | "unavailable";
  targetMean: number | null;
  targetMedian: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  asOf: number;
  source: string;
}

/** Deterministic valuation models — assumptions always exposed. */
export interface DcfAssumptions {
  baseFcf: number;
  growthYears1to5: number;
  growthTerminal: number;
  discountRate: number;
  sharesOutstanding: number;
  netDebt: number;
}

export interface DcfResult {
  fairValue: number;
  equityValue: number;
  pvExplicit: number;
  pvTerminal: number;
  assumptions: DcfAssumptions;
  sensitivity: { discountRate: number; terminalGrowth: number; fairValue: number }[];
}

export interface ReverseDcfResult {
  impliedGrowthYears1to5: number;
  price: number;
  assumptions: Omit<DcfAssumptions, "growthYears1to5">;
  note: string;
}

export interface ValuationModel {
  dcf: DcfResult | null;
  dcfError: string | null;
  reverseDcf: ReverseDcfResult | null;
  comps: { metric: string; value: number | null; peerMedian: number | null; verdict: string }[];
}

export interface ConsensusLine {
  agent: string;
  stance: Stance;
  selfConfidence: number;
  verifiedConfidence: number; // after fact-check downgrade
  weight: number; // transparency: why it counted this much
  weightBreakdown: string;
}

export interface ConsensusResult {
  stance: Stance;
  score: number; // -1 bearish .. +1 bullish
  lines: ConsensusLine[];
  redTeamVeto: boolean;
  synthesis: string;
  disagreement: "low" | "moderate" | "high";
}

export interface ConfidenceReport {
  level: "low" | "moderate" | "high";
  dataCompleteness: number;
  sourceQuality: number;
  recency: number;
  agreement: number;
  contradiction: number;
  breakdown: string[];
}

export interface Scenario {
  name: "bull" | "base" | "bear" | "extreme-bear";
  probabilityPct: number;
  assumptions: string[];
  drivers: string[];
  risks: string[];
  impliedMovePct: number | null;
}

export interface InvalidationCondition {
  condition: string;
  metric: string;
  threshold: number;
  operator: ">" | "<";
  basis: string; // why this threshold
}

export interface Thesis {
  ticker: string;
  stance: Stance;
  summary: string;
  baseCase: string;
  bullCase: string;
  bearCase: string;
  extremeBear: string;
  invalidationConditions: InvalidationCondition[];
  scenarios: Scenario[];
  confidence: ConfidenceReport;
}

export interface ResearchRun {
  id: number;
  ticker: string;
  ts: number;
  status: "complete" | "partial" | "failed";
  consensus: ConsensusResult;
  thesis: Thesis;
  agents: AgentOutput[];
  valuation: ValuationModel;
  dataPack: DataPack;
  forecast: {
    direction: "up" | "down";
    horizonDays: number;
    expectedMovePct: number | null;
    priceAtForecast: number;
  } | null;
  promptVersions: Record<string, string>;
  durationMs: number;
  errors: string[];
}

export interface StoredForecast {
  id: number;
  runId: number;
  ticker: string;
  ts: number;
  horizonDays: number;
  direction: "up" | "down";
  expectedMovePct: number | null;
  priceAtForecast: number;
  status: "pending" | "resolved";
  resolvedTs: number | null;
  actualMovePct: number | null;
  correct: number | null; // 1 correct, 0 wrong
}
