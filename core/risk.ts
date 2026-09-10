import type { AccountState, CouncilDecision, MarketSnapshot } from "./types";
import { atr } from "./indicators";
import { config } from "./config";

export interface OrderPlan {
  side: "buy" | "sell";
  qtyBtc: number;
  stop: number;
  target: number;
  riskUsd: number;
  note: string;
}

const MIN_NOTIONAL_USD = 20;

export function planOrder(snap: MarketSnapshot, decision: CouncilDecision, account: AccountState): OrderPlan | null {
  if (decision.side === "hold" || decision.conviction < 0.3) return null;
  if (account.halted) return null;

  const price = snap.btcPrice;
  const a = atr(snap.candles1h, 14) || price * 0.008;

  if (decision.side === "buy") {
    if (account.position.side === "long") return null; // never pyramids
    if (account.position.side === "short") {
      // closing short handled separately by risk engine exit rules
      return null;
    }
    const stop = price - 2 * a;
    const riskUsd = account.equityUsd * 0.01 * (0.5 + decision.conviction);
    const perUnitRisk = Math.max(price - stop, price * 0.002);
    let qty = riskUsd / perUnitRisk;
    const maxNotional = account.equityUsd * 0.35;
    qty = Math.min(qty, maxNotional / price);
    if (config.brokerMode === "kraken") {
      qty = Math.min(qty, config.kraken.maxExposureUsd / price);
    }
    if (qty * price < MIN_NOTIONAL_USD) {
      return { side: "buy", qtyBtc: 0, stop, target: price + 3 * a, riskUsd, note: "skip: below min notional" };
    }
    return {
      side: "buy",
      qtyBtc: Math.round(qty * 1e6) / 1e6,
      stop: Math.round(stop * 100) / 100,
      target: Math.round((price + 3 * a) * 100) / 100,
      riskUsd: Math.round(riskUsd * 100) / 100,
      note: `1R=${(riskUsd / Math.max(qty * perUnitRisk, 1e-9) * 100).toFixed(0)}%`,
    };
  }

  // decision.side === "sell"
  if (account.position.side === "short") return null;
  if (account.position.side === "long") {
    // sell-to-close handled by risk engine; council sell on a long = exit
    return {
      side: "sell",
      qtyBtc: account.position.qtyBtc,
      stop: 0,
      target: 0,
      riskUsd: 0,
      note: "exit long on council sell",
    };
  }
  // No shorting in paper MVP — flat + sell signal = stay flat
  return null;
}

export function shouldExit(
  snap: MarketSnapshot,
  account: AccountState,
): { exit: boolean; reason: string } {
  const pos = account.position;
  if (pos.side !== "long" || pos.qtyBtc <= 0) return { exit: false, reason: "" };
  const price = snap.btcPrice;
  const a = atr(snap.candles1h, 14) || price * 0.008;
  const stop = pos.entryPrice - 2 * a;
  const target = pos.entryPrice + 3 * a;
  if (price <= stop) return { exit: true, reason: `stop hit ${price.toFixed(0)} <= ${stop.toFixed(0)}` };
  if (price >= target) return { exit: true, reason: `target hit ${price.toFixed(0)} >= ${target.toFixed(0)}` };
  const heldHours = (Date.now() - pos.openedTs) / 3_600_000;
  if (heldHours > 96) return { exit: true, reason: `time stop ${heldHours.toFixed(1)}h > 96h` };
  return { exit: false, reason: "" };
}

export function checkKillSwitch(account: AccountState): { halt: boolean; reason: string } {
  if (account.peakEquityUsd <= 0) return { halt: false, reason: "" };
  const dd = 1 - account.equityUsd / account.peakEquityUsd;
  if (dd >= config.killSwitchDd) {
    return { halt: true, reason: `kill switch: drawdown ${(dd * 100).toFixed(1)}% >= ${(config.killSwitchDd * 100).toFixed(0)}%` };
  }
  return { halt: false, reason: "" };
}
