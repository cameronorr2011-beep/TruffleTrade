import { config } from "./config";
import { marketSnapshot } from "./market";
import { runCouncil } from "./brain";
import { planOrder, shouldExit, checkKillSwitch } from "./risk";
import { PaperBroker, type Broker } from "./broker";
import { KrakenBroker } from "./kraken";
import {
  getDb,
  loadAccount,
  saveAccount,
  recordTrade,
  recordCycle,
  recordEquity,
} from "./ledger";
import type { AccountState, MarketSnapshot } from "./types";

export function makeBroker(): Broker {
  return config.brokerMode === "kraken" ? new KrakenBroker() : new PaperBroker();
}

export function markToMarket(snap: MarketSnapshot, acct: AccountState): AccountState {
  const pos = acct.position;
  const equity = acct.cashUsd + (pos.side === "long" ? pos.qtyBtc * snap.btcPrice : 0);
  const next = { ...acct, equityUsd: Math.round(equity * 100) / 100 };
  next.peakEquityUsd = Math.max(next.peakEquityUsd, next.equityUsd);
  return next;
}

async function openPosition(
  broker: Broker,
  acct: AccountState,
  plan: { side: "buy" | "sell"; qtyBtc: number; note: string },
  cycleId: number,
): Promise<AccountState> {
  const fill = await broker.marketBuy(plan.qtyBtc, `cycle:${cycleId}`);
  recordTrade({
    ts: Date.now(),
    side: fill.side,
    qtyBtc: fill.qtyBtc,
    price: fill.price,
    feeUsd: fill.feeUsd,
    slippageUsd: fill.slippageUsd,
    realizedPnlUsd: null,
    mode: broker.mode,
    reason: `council entry | ${plan.note}`,
    cycleId,
    ref: fill.ref,
  });
  const cost = fill.qtyBtc * fill.price + fill.feeUsd;
  return {
    ...acct,
    cashUsd: Math.round((acct.cashUsd - cost) * 100) / 100,
    position: { side: "long", qtyBtc: fill.qtyBtc, entryPrice: fill.price, openedTs: Date.now() },
  };
}

async function closePosition(
  broker: Broker,
  acct: AccountState,
  reason: string,
  cycleId: number,
): Promise<AccountState> {
  const pos = acct.position;
  if (pos.side !== "long" || pos.qtyBtc <= 0) return acct;
  const fill = await broker.marketSell(pos.qtyBtc, `cycle:${cycleId}`);
  const proceeds = fill.qtyBtc * fill.price - fill.feeUsd;
  const cost = pos.qtyBtc * pos.entryPrice;
  const pnl = Math.round((proceeds - cost) * 100) / 100;
  recordTrade({
    ts: Date.now(),
    side: "sell",
    qtyBtc: fill.qtyBtc,
    price: fill.price,
    feeUsd: fill.feeUsd,
    slippageUsd: fill.slippageUsd,
    realizedPnlUsd: pnl,
    mode: broker.mode,
    reason,
    cycleId,
    ref: fill.ref,
  });
  return {
    ...acct,
    cashUsd: Math.round((acct.cashUsd + proceeds) * 100) / 100,
    position: { side: "flat", qtyBtc: 0, entryPrice: 0, openedTs: 0 },
  };
}

export async function cycleOnce(
  broker: Broker,
  cycleIdForRef = 0,
): Promise<{ decisionSummary: string; executed: boolean; side: string }> {
  const db = getDb();
  const snap = await marketSnapshot();
  let acct = markToMarket(snap, loadAccount(config.paperStartUsd));

  // 0) Hard kill switch
  const ks = checkKillSwitch(acct);
  if (ks.halt && !acct.halted) {
    acct = { ...acct, halted: true, haltReason: ks.reason };
    acct = await closePosition(broker, acct, ks.reason, cycleIdForRef);
    saveAccount(acct);
    recordCycle({
      ts: Date.now(),
      mode: broker.mode,
      btcPrice: snap.btcPrice,
      decision: `HALTED ${ks.reason}`,
      executed: false,
      equityAfter: acct.equityUsd,
      councilJson: JSON.stringify({ killSwitch: ks.reason }),
    });
    return { decisionSummary: `HALTED: ${ks.reason}`, executed: false, side: "halted" };
  }

  // 1) Risk-engine exits take priority (stop / target / time stop)
  const exit = shouldExit(snap, acct);
  if (exit.exit) {
    acct = await closePosition(broker, acct, exit.reason, cycleIdForRef);
    acct = markToMarket(snap, acct);
    saveAccount(acct);
    recordEquity(Date.now(), acct.equityUsd, broker.mode);
    return { decisionSummary: `executed exit: ${exit.reason}`, executed: true, side: "exit" };
  }

  if (acct.halted) {
    return { decisionSummary: "halted (kill switch active) — no trades", executed: false, side: "halted" };
  }

  // 2) Council of rivals deliberates; red team gates execution
  const decision = await runCouncil(config.groqApiKey, config.groqModel, snap, acct);
  const plan = planOrder(snap, decision, acct);

  let executed = false;
  if (plan && plan.qtyBtc > 0) {
    try {
      if (broker instanceof KrakenBroker) broker.setPrice(snap.btcPrice);
      if (plan.side === "buy") {
        acct = await openPosition(broker, acct, plan, cycleIdForRef);
      } else {
        acct = await closePosition(broker, acct, plan.note, cycleIdForRef);
      }
      executed = true;
    } catch (err) {
      console.error(`[engine] execution failed: ${(err as Error).message}`);
    }
  }

  acct = markToMarket(snap, acct);
  saveAccount(acct);
  recordEquity(Date.now(), acct.equityUsd, broker.mode);

  const cycleId = recordCycle({
    ts: Date.now(),
    mode: broker.mode,
    btcPrice: snap.btcPrice,
    decision: `${decision.side} (conviction ${decision.conviction})`,
    executed,
    equityAfter: acct.equityUsd,
    councilJson: JSON.stringify(decision),
  });
  db.prepare(`UPDATE trades SET cycle_id = ? WHERE cycle_id = 0 AND ts >= ?`).run(cycleId, snap.ts - 1000);

  const summary =
    decision.side === "hold"
      ? `hold — ${decision.rationale}`
      : `${decision.side} conviction=${decision.conviction} executed=${executed} — red team ${decision.redTeam.approved ? "approved" : "blocked"}`;
  return { decisionSummary: summary, executed, side: decision.side };
}

export async function runLoop(onCycle?: (r: { decisionSummary: string }) => void): Promise<void> {
  const broker = makeBroker();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const r = await cycleOnce(broker);
      onCycle?.(r);
    } catch (err) {
      console.error(`[engine] cycle error: ${(err as Error).message}`);
    }
    await new Promise((res) => setTimeout(res, config.cycleSeconds * 1000));
  }
}

export async function haltDesk(broker?: Broker): Promise<{ halted: boolean; reason: string }> {
  const b = broker ?? makeBroker();
  const acct = loadAccount(config.paperStartUsd);
  const updated = { ...acct, halted: true, haltReason: acct.haltReason ?? "manual halt via desk" };
  let final: AccountState = updated;
  if (updated.position.side === "long") {
    final = await closePosition(b, updated, "manual halt — flatten", 0);
  }
  saveAccount(final);
  return { halted: true, reason: final.haltReason ?? "manual halt" };
}
