import type { AgentVote, Side } from "./types";

export interface TallyResult {
  side: Side;
  net: number;
  agreement: number;
  conviction: number;
  buyWeight: number;
  sellWeight: number;
}

const APPROVAL_THRESHOLD = 0.5;

/**
 * Conviction-weighted council tally.
 * - net = buyWeight - sellWeight; requires |net| >= APPROVAL_THRESHOLD to act.
 * - agreement = |net| / (buyWeight + sellWeight): how one-sided the pit is.
 * - conviction blends agreement with average survivor confidence, floored at 0.15.
 */
export function tallyVotes(votes: AgentVote[]): TallyResult {
  const sumConf = (side: Side) =>
    votes.filter((v) => v.side === side).reduce((s, v) => s + Math.min(1, Math.max(0, v.confidence)), 0);
  const buyWeight = sumConf("buy");
  const sellWeight = sumConf("sell");
  const net = buyWeight - sellWeight;
  const total = buyWeight + sellWeight;
  const agreement = total > 0 ? Math.abs(net) / total : 0;

  let side: Side = "hold";
  if (net >= APPROVAL_THRESHOLD) side = "buy";
  else if (net <= -APPROVAL_THRESHOLD) side = "sell";

  const survivors = side === "hold" ? [] : votes.filter((v) => v.side === side);
  const avgSurvivorConfidence = survivors.length
    ? survivors.reduce((s, v) => s + Math.min(1, Math.max(0, v.confidence)), 0) / survivors.length
    : 0;
  const conviction = survivors.length
    ? Math.min(1, agreement * avgSurvivorConfidence + 0.15)
    : 0;

  return {
    side,
    net: Math.round(net * 100) / 100,
    agreement: Math.round(agreement * 100) / 100,
    conviction: Math.round(conviction * 100) / 100,
    buyWeight: Math.round(buyWeight * 100) / 100,
    sellWeight: Math.round(sellWeight * 100) / 100,
  };
}
