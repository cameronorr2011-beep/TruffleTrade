import { config } from "@core/config";
import { loadAccount, recentTrades, equityCurve, stats, getDb } from "@core/ledger";
import { btcPrice } from "@core/market";
import { DexBroker } from "@core/dex";
import type { AccountState, CouncilDecision, LedgerTrade } from "@core/types";

export interface CouncilSummary {
  side: string;
  conviction: number;
  rationale: string;
  votes: { agent: string; side: string; confidence: number; rationale: string }[];
  redTeam: { approved: boolean; objections: string[]; notes: string };
  ts: number;
  btcPrice: number;
}

export interface DeskSnapshot {
  account: AccountState;
  btcPrice: number;
  priceSource: string;
  trades: LedgerTrade[];
  equityCurve: { ts: number; equityUsd: number }[];
  stats: { trades: number; wins: number; losses: number; realizedPnlUsd: number; winRate: number | null };
  lastCouncil: CouncilSummary | null;
  mode: string;
  cycleSeconds: number;
  onchain: OnchainStatus;
}

export interface OnchainStatus {
  configured: boolean;
  enabled: boolean;
  address?: string;
  usdc?: number;
  cbbtc?: number;
  gasEth?: number;
  maxUsdPerTrade: number;
  maxTotalUsd: number;
  slippageBps: number;
}

export function lastCouncil(): CouncilSummary | null {
  try {
    const row = getDb()
      .prepare(`SELECT ts, btc_price, council_json FROM cycles ORDER BY id DESC LIMIT 1`)
      .get() as { ts: number; btc_price: number; council_json: string } | undefined;
    if (!row) return null;
    const d = JSON.parse(row.council_json) as CouncilDecision;
    return {
      side: d.side,
      conviction: d.conviction,
      rationale: d.rationale,
      votes: d.votes ?? [],
      redTeam: {
        approved: Boolean(d.redTeam?.approved),
        objections: d.redTeam?.objections ?? [],
        notes: d.redTeam?.notes ?? "",
      },
      ts: Number(row.ts),
      btcPrice: Number(row.btc_price),
    };
  } catch {
    return null;
  }
}

export async function onchainStatus(): Promise<OnchainStatus> {
  const base: OnchainStatus = {
    configured: config.brokerMode === "onchain",
    enabled: config.onchain.tradingEnabled && Boolean(config.onchain.privateKey),
    maxUsdPerTrade: config.onchain.maxUsdPerTrade,
    maxTotalUsd: config.onchain.maxTotalUsd,
    slippageBps: config.onchain.slippageBps,
  };
  if (!base.enabled) return base;
  try {
    const dex = new DexBroker();
    const [usdc, cbbtc, gas] = await Promise.all([dex.usdcBalance(), dex.cbbtcBalance(), dex.gasStatus()]);
    return { ...base, address: dex.address, usdc, cbbtc, gasEth: gas.eth };
  } catch {
    return base;
  }
}

export async function deskSnapshot(): Promise<DeskSnapshot> {
  const tick = await btcPrice().catch(() => ({ price: 0, source: "unreachable" }));
  const account = loadAccount(config.paperStartUsd);
  const pos = account.position;
  const equity = account.cashUsd + (pos.side === "long" ? pos.qtyBtc * tick.price : 0);
  return {
    account: { ...account, equityUsd: Math.round(equity * 100) / 100 },
    btcPrice: tick.price,
    priceSource: tick.source,
    trades: recentTrades(20),
    equityCurve: equityCurve(240),
    stats: stats(),
    lastCouncil: lastCouncil(),
    mode: config.brokerMode,
    cycleSeconds: config.cycleSeconds,
    onchain: await onchainStatus(),
  };
}
