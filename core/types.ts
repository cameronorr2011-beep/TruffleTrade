export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

export interface MacroContext {
  spy: { symbol: string; price: number; changePct: number };
  vixy: { symbol: string; price: number; changePct: number };
  dxy: { symbol: string; price: number; changePct: number };
  riskOn: boolean;
  btcSpyCorrelation: number | null;
}

export interface MarketSnapshot {
  ts: number;
  btcPrice: number;
  candles1h: Candle[];
  candles1d: Candle[];
  realizedVol1hPct: number;
  realizedVol1dPct: number;
  featurePack: FeaturePack;
  macro: MacroContext;
  sources: string[];
}

export interface FeaturePack {
  price: number;
  sma20: number;
  sma50: number;
  ema12: number;
  ema26: number;
  rsi14: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  atr14: number;
  atrPct: number;
  bbUpper: number;
  bbLower: number;
  bbPctB: number;
  donchian20High: number;
  donchian20Low: number;
  volZ: number;
  ret1h: number;
  ret24h: number;
  ret7d: number;
  ret30d: number;
  hh50: boolean;
  ll50: boolean;
}

export type Side = "buy" | "hold" | "sell";

export interface AgentVote {
  agent: string;
  style: string;
  side: Side;
  confidence: number;
  rationale: string;
}

export interface RedTeamVerdict {
  approved: boolean;
  confidence: number;
  objections: string[];
  notes: string;
}

export interface CouncilDecision {
  side: Side;
  conviction: number;
  entry: number | null;
  stop: number | null;
  target: number | null;
  riskUsd: number | null;
  rationale: string;
  votes: AgentVote[];
  redTeam: RedTeamVerdict;
  model: string;
}

export interface Position {
  side: "long" | "short" | "flat";
  qtyBtc: number;
  entryPrice: number;
  openedTs: number;
}

export interface AccountState {
  equityUsd: number;
  cashUsd: number;
  position: Position;
  peakEquityUsd: number;
  halted: boolean;
  haltReason?: string;
}

export interface LedgerTrade {
  id?: number;
  ts: number;
  side: Side;
  qtyBtc: number;
  price: number;
  feeUsd: number;
  slippageUsd: number;
  realizedPnlUsd: number | null;
  mode: "paper" | "kraken";
  reason: string;
  cycleId?: number;
  ref?: string;
}

export interface CycleRecord {
  id?: number;
  ts: number;
  mode: "paper" | "kraken";
  btcPrice: number;
  decision: string;
  executed: boolean;
  equityAfter: number;
  councilJson: string;
}
