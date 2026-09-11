// Paper trading domain — explicitly simulated, never real execution.
// INVARIANT: every object here is SIMULATED state; nothing in this module
// may touch a broker, exchange, or wallet.

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "pending" | "filled" | "partially_filled" | "cancelled" | "rejected";

export interface SimulationAssumptions {
  feeModel: string; // e.g. "flat_bps"
  feeBps: number; // basis points of notional per fill
  slippageModel: string; // e.g. "fixed_bps_adverse"
  slippageBps: number; // basis points adverse
  fillModel: "next_bar_close" | "quote_markout"; // which price fills an order
  marketDataSource: string; // provenance of prices used
  asOf: number; // simulation timestamp
}

export interface PaperAccount {
  id: number;
  ownerCodeHash: string; // tied to the access-code holder; no personal data
  cashUsd: number;
  startUsd: number;
  createdAt: number;
  assumptions: SimulationAssumptions;
}

export interface PaperOrder {
  id: number;
  accountId: number;
  ticker: string;
  side: OrderSide;
  type: OrderType;
  quantity: number; // shares, > 0
  limitPrice: number | null; // required for limit orders
  status: OrderStatus;
  createdAt: number;
  reason?: string; // rejection reason when status=rejected
}

export interface PaperFill {
  id: number;
  orderId: number;
  ticker: string;
  side: OrderSide;
  quantity: number;
  priceUsd: number;
  feeUsd: number;
  slippageUsd: number;
  ts: number;
}

export interface PaperPosition {
  ticker: string;
  quantity: number; // >= 0 (long-only; shorts are NOT supported)
  avgCostUsd: number;
}

export interface PaperSnapshot {
  accountId: number;
  ts: number;
  cashUsd: number;
  positionsValueUsd: number;
  portfolioValueUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
}

export interface PaperTransaction {
  id: number;
  accountId: number;
  kind: "deposit" | "withdrawal" | "trade_settlement";
  amountUsd: number; // signed cash movement
  ts: number;
  note: string;
}
