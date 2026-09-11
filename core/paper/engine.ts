// Deterministic paper-trading engine (spec §19/§20).
// AI RECOMMENDS → RISK ENGINE VALIDATES → PAPER ENGINE SIMULATES.
// Long-only by design; shorts are NOT supported (Invariant: negative quantity
// only via an explicit shorting feature, which does not exist here).
// All arithmetic is plain floats guarded by finite/positive checks so the
// portfolio can never become NaN (property-tested).

import type {
  PaperAccount,
  PaperFill,
  PaperOrder,
  PaperPosition,
  SimulationAssumptions,
} from "./types";

export const DEFAULT_ASSUMPTIONS: SimulationAssumptions = {
  feeModel: "flat_bps",
  feeBps: Number(process.env.PAPER_FEE_BPS?.trim() || 5), // 0.05%
  slippageModel: "fixed_bps_adverse",
  slippageBps: Number(process.env.PAPER_SLIPPAGE_BPS?.trim() || 10), // 0.10%
  fillModel: "quote_markout",
  marketDataSource: "yahoo:chart",
  asOf: Date.now(),
};

export interface FillInput {
  order: Pick<PaperOrder, "ticker" | "side" | "quantity" | "type" | "limitPrice">;
  price: number; // current market price (provenance: marketDataSource)
  account: Pick<PaperAccount, "cashUsd">;
  assumptions?: SimulationAssumptions;
}

export interface FillResult {
  fill: Omit<PaperFill, "id" | "orderId">;
  cashDeltaUsd: number; // signed: buys negative, sells positive
  positionDelta: number; // signed shares
  realizedPnlUsd: number; // only non-zero on sells
  avgCostAfterUsd: number; // new position avg cost (for buys)
}

export class PaperEngineError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_INPUT"
      | "INSUFFICIENT_CASH"
      | "NO_POSITION"
      | "OVERSOLD"
      | "LIMIT_NOT_TOUCHED"
      | "RISK_BLOCK",
  ) {
    super(message);
    this.name = "PaperEngineError";
  }
}

function mustBeFinitePositive(x: number, what: string): number {
  if (!Number.isFinite(x) || x <= 0) {
    throw new PaperEngineError(`${what} must be a positive finite number`, "INVALID_INPUT");
  }
  return x;
}

/** Execute one order against a price, returning the fill and all accounting. */
export function executeFill(input: FillInput): FillResult {
  const a = input.assumptions ?? DEFAULT_ASSUMPTIONS;
  const qty = mustBeFinitePositive(input.order.quantity, "quantity");
  const px = mustBeFinitePositive(input.price, "price");

  if (input.order.type === "limit") {
    const lp = mustBeFinitePositive(input.order.limitPrice ?? NaN, "limitPrice");
    const touched = input.order.side === "buy" ? px <= lp : px >= lp;
    if (!touched) throw new PaperEngineError("limit price not touched by market", "LIMIT_NOT_TOUCHED");
  }

  // Adverse slippage: pay more when buying, receive less when selling.
  const slip = px * (a.slippageBps / 10_000);
  const execPrice = input.order.side === "buy" ? px + slip : px - slip;
  const notional = execPrice * qty;
  const fee = notional * (a.feeBps / 10_000);
  const slippageCost = slip * qty;

  if (input.order.side === "buy") {
    const cost = notional + fee;
    if (cost > input.account.cashUsd + 1e-9) {
      throw new PaperEngineError(
        `insufficient cash: need ${cost.toFixed(2)}, have ${input.account.cashUsd.toFixed(2)}`,
        "INSUFFICIENT_CASH",
      );
    }
    return {
      fill: {
        ticker: input.order.ticker, side: "buy", quantity: qty, priceUsd: execPrice,
        feeUsd: fee, slippageUsd: slippageCost, ts: Date.now(),
      },
      cashDeltaUsd: -cost,
      positionDelta: qty,
      realizedPnlUsd: 0,
      avgCostAfterUsd: execPrice, // caller blends with existing position
    };
  }

  // sell: caller guarantees sufficient position (risk gate + engine check)
  return {
    fill: {
      ticker: input.order.ticker, side: "sell", quantity: qty, priceUsd: execPrice,
      feeUsd: fee, slippageUsd: slippageCost, ts: Date.now(),
    },
    cashDeltaUsd: notional - fee,
    positionDelta: -qty,
    realizedPnlUsd: NaN, // computed by caller with avg cost — never guessed here
    avgCostAfterUsd: NaN,
  };
}

export interface PositionBook {
  positions: Map<string, PaperPosition>;
  realizedPnlUsd: number;
}

/** Apply a fill result to the position book with proper avg-cost accounting. */
export function applyToBook(
  book: PositionBook,
  order: Pick<PaperOrder, "ticker" | "side" | "quantity">,
  res: FillResult,
): { realizedPnlUsd: number } {
  const key = order.ticker;
  const pos = book.positions.get(key) ?? { ticker: key, quantity: 0, avgCostUsd: 0 };

  if (order.side === "buy") {
    const newQty = pos.quantity + res.positionDelta;
    pos.avgCostUsd =
      newQty > 0 ? (pos.avgCostUsd * pos.quantity + execNotional(res)) / newQty : 0;
    pos.quantity = newQty;
    book.positions.set(key, pos);
    return { realizedPnlUsd: 0 };
  }

  // sell
  if (pos.quantity < order.quantity - 1e-9) {
    throw new PaperEngineError(
      `oversell: hold ${pos.quantity} of ${order.ticker}, tried to sell ${order.quantity}`,
      "OVERSOLD",
    );
  }
  const realized = (res.fill.priceUsd - pos.avgCostUsd) * order.quantity;
  pos.quantity -= order.quantity;
  if (pos.quantity <= 1e-9) {
    book.positions.delete(key);
  } else {
    book.positions.set(key, pos);
  }
  book.realizedPnlUsd += realized;
  return { realizedPnlUsd: realized };
}

function execNotional(res: FillResult): number {
  return res.fill.priceUsd * res.fill.quantity;
}

/** Mark-to-market portfolio value. Refuses NaN/Infinity inputs. */
export function portfolioValue(
  cashUsd: number,
  positions: PaperPosition[],
  markPrices: Record<string, number>,
): { positionsValueUsd: number; portfolioValueUsd: number; unrealizedPnlUsd: number } {
  if (!Number.isFinite(cashUsd)) throw new PaperEngineError("cash became non-finite", "INVALID_INPUT");
  let positionsValue = 0;
  let unrealized = 0;
  for (const p of positions) {
    const mark = markPrices[p.ticker];
    if (mark == null || !Number.isFinite(mark) || mark <= 0) {
      // No mark price → position valued at cost (honest fallback), flagged by caller.
      positionsValue += p.avgCostUsd * p.quantity;
      continue;
    }
    positionsValue += mark * p.quantity;
    unrealized += (mark - p.avgCostUsd) * p.quantity;
  }
  if (!Number.isFinite(positionsValue)) throw new PaperEngineError("positions value became non-finite", "INVALID_INPUT");
  return { positionsValueUsd: positionsValue, portfolioValueUsd: cashUsd + positionsValue, unrealizedPnlUsd: unrealized };
}
