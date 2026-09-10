import { config } from "@core/config";
import { loadAccount, recentTrades, equityCurve, stats, getDb } from "@core/ledger";
import { btcPrice } from "@core/market";
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
  };
}
