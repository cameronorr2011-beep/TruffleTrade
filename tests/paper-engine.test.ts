import { describe, expect, it } from "vitest";

// Deterministic unit tests for the paper engine + risk engine (spec §35/§36).
// No DB, no network: pure accounting invariants.

import {
  DEFAULT_ASSUMPTIONS,
  PaperEngineError,
  applyToBook,
  executeFill,
  portfolioValue,
  type PositionBook,
} from "../core/paper/engine";
import { DEFAULT_RISK, concentrationWarnings, validateOrder, type RiskConfig } from "../core/paper/risk";

const A = { ...DEFAULT_ASSUMPTIONS };

function freshBook(): PositionBook {
  return { positions: new Map(), realizedPnlUsd: 0 };
}

describe("paper engine — fills", () => {
  it("buys at price + adverse slippage and charges fees", () => {
    const res = executeFill({
      order: { ticker: "AAPL", side: "buy", quantity: 10, type: "market", limitPrice: null },
      price: 100,
      account: { cashUsd: 10_000 },
      assumptions: A,
    });
    expect(res.fill.priceUsd).toBeCloseTo(100.1, 6); // 10 bps slippage
    expect(res.cashDeltaUsd).toBeLessThan(0);
    expect(res.realizedPnlUsd).toBe(0);
    const notional = 100.1 * 10;
    expect(res.cashDeltaUsd).toBeCloseTo(-(notional + notional * 0.0005), 6);
  });

  it("sells at price − adverse slippage and credits cash minus fees", () => {
    const res = executeFill({
      order: { ticker: "AAPL", side: "sell", quantity: 10, type: "market", limitPrice: null },
      price: 100,
      account: { cashUsd: 0 },
      assumptions: A,
    });
    expect(res.fill.priceUsd).toBeCloseTo(99.9, 6);
    expect(res.cashDeltaUsd).toBeCloseTo(999 - 0.4995, 4);
    expect(res.positionDelta).toBe(-10);
  });

  it("rejects non-finite or non-positive inputs (NaN cannot enter the book)", () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      expect(() =>
        executeFill({
          order: { ticker: "AAPL", side: "buy", quantity: bad, type: "market", limitPrice: null },
          price: 100,
          account: { cashUsd: 1e9 },
          assumptions: A,
        }),
      ).toThrow(PaperEngineError);
      expect(() =>
        executeFill({
          order: { ticker: "AAPL", side: "buy", quantity: 1, type: "market", limitPrice: null },
          price: bad,
          account: { cashUsd: 1e9 },
          assumptions: A,
        }),
      ).toThrow(PaperEngineError);
    }
  });

  it("blocks insufficient cash", () => {
    expect(() =>
      executeFill({
        order: { ticker: "AAPL", side: "buy", quantity: 100, type: "market", limitPrice: null },
        price: 500,
        account: { cashUsd: 1000 },
        assumptions: A,
      }),
    ).toThrow(/insufficient cash/);
  });

  it("limit buys only fill at or below the limit; sells at or above", () => {
    expect(() =>
      executeFill({
        order: { ticker: "AAPL", side: "buy", quantity: 1, type: "limit", limitPrice: 90 },
        price: 95,
        account: { cashUsd: 1e9 },
        assumptions: A,
      }),
    ).toThrow(/limit price not touched/);
    const okSell = executeFill({
      order: { ticker: "AAPL", side: "sell", quantity: 1, type: "limit", limitPrice: 95 },
      price: 95,
      account: { cashUsd: 0 },
      assumptions: A,
    });
    expect(okSell.fill.priceUsd).toBeGreaterThan(0);
  });
});

describe("paper engine — position book", () => {
  it("blends average cost across partial buys and realizes P/L on sells", () => {
    const book = freshBook();
    const buy1 = executeFill({
      order: { ticker: "MSFT", side: "buy", quantity: 10, type: "market", limitPrice: null },
      price: 100,
      account: { cashUsd: 1e9 },
      assumptions: A,
    });
    applyToBook(book, { ticker: "MSFT", side: "buy", quantity: 10 }, buy1);
    const pos = book.positions.get("MSFT")!;
    expect(pos.quantity).toBe(10);
    expect(pos.avgCostUsd).toBeCloseTo(100.1, 6);

    const buy2 = executeFill({
      order: { ticker: "MSFT", side: "buy", quantity: 10, type: "market", limitPrice: null },
      price: 110,
      account: { cashUsd: 1e9 },
      assumptions: A,
    });
    applyToBook(book, { ticker: "MSFT", side: "buy", quantity: 10 }, buy2);
    expect(book.positions.get("MSFT")!.quantity).toBe(20);
    expect(book.positions.get("MSFT")!.avgCostUsd).toBeCloseTo((100.1 * 10 + 110.11 * 10) / 20, 4);

    const sell = executeFill({
      order: { ticker: "MSFT", side: "sell", quantity: 20, type: "market", limitPrice: null },
      price: 120,
      account: { cashUsd: 0 },
      assumptions: A,
    });
    const { realizedPnlUsd } = applyToBook(book, { ticker: "MSFT", side: "sell", quantity: 20 }, sell);
    expect(realizedPnlUsd).toBeGreaterThan(0);
    expect(book.positions.has("MSFT")).toBe(false); // flat: position deleted
  });

  it("never allows oversell (quantity floor at zero; shorts not supported)", () => {
    const book = freshBook();
    const buy = executeFill({
      order: { ticker: "TSLA", side: "buy", quantity: 5, type: "market", limitPrice: null },
      price: 200,
      account: { cashUsd: 1e9 },
      assumptions: A,
    });
    applyToBook(book, { ticker: "TSLA", side: "buy", quantity: 5 }, buy);
    const sellTooMuch = executeFill({
      order: { ticker: "TSLA", side: "sell", quantity: 6, type: "market", limitPrice: null },
      price: 200,
      account: { cashUsd: 0 },
      assumptions: A,
    });
    expect(() => applyToBook(book, { ticker: "TSLA", side: "sell", quantity: 6 }, sellTooMuch)).toThrow(/oversell/);
    expect(book.positions.get("TSLA")!.quantity).toBe(5);
  });

  it("marks portfolio to market; missing mark falls back to cost, never NaN", () => {
    const v1 = portfolioValue(
      5_000,
      [
        { ticker: "AAPL", quantity: 10, avgCostUsd: 100 },
        { ticker: "NOQUOTE", quantity: 2, avgCostUsd: 50 },
      ],
      { AAPL: 110 },
    );
    expect(v1.portfolioValueUsd).toBe(5_000 + 1_100 + 100);
    expect(Number.isFinite(v1.portfolioValueUsd)).toBe(true);
    expect(() => portfolioValue(NaN, [], {})).toThrow(/non-finite/);
  });
});

describe("risk engine — deterministic gates (AI cannot override)", () => {
  const baseCtx = {
    cashUsd: 100_000,
    positionsValueUsd: 0,
    peakPortfolioValueUsd: 100_000,
    existingPositionQty: 0,
    existingPositionAvgCost: 0,
    markPrice: 100,
    dataQualityOk: true,
  };

  it("passes a normal buy inside every cap", () => {
    const v = validateOrder(
      DEFAULT_RISK,
      { ticker: "AAPL", side: "buy", quantity: 100, estimatedNotionalUsd: 10_000 },
      baseCtx,
    );
    expect(v.ok).toBe(true);
  });

  it("blocks a buy that would exceed the per-position cap", () => {
    // $24k into a $60k portfolio = 40% > 25% cap, while staying under the
    // $25k per-order cap so THIS gate (not the order cap) is what fires.
    const v = validateOrder(
      DEFAULT_RISK,
      { ticker: "AAPL", side: "buy", quantity: 240, estimatedNotionalUsd: 24_000 },
      { ...baseCtx, cashUsd: 60_000, peakPortfolioValueUsd: 60_000 },
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.check).toBe("max_position_size");
  });

  it("blocks a buy that would exceed total exposure", () => {
    // Portfolio = 100k cash + 45k positions = 145k. A $30k buy (order cap
    // raised to $50k so it doesn't fire first) → exposure 75k/145k = 51.7% > 50%.
    const cfg: RiskConfig = { ...DEFAULT_RISK, maxTotalExposurePct: 0.5, maxSingleOrderNotionalUsd: 50_000 };
    const v = validateOrder(
      cfg,
      { ticker: "AAPL", side: "buy", quantity: 300, estimatedNotionalUsd: 30_000 },
      { ...baseCtx, positionsValueUsd: 45_000 },
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.check).toBe("max_exposure");
  });

  it("blocks orders above the per-order notional cap", () => {
    const v = validateOrder(
      DEFAULT_RISK,
      { ticker: "AAPL", side: "buy", quantity: 1e6, estimatedNotionalUsd: 1e7 },
      baseCtx,
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.check).toBe("max_order_notional");
  });

  it("blocks stale/unverified market data (fail closed)", () => {
    const v = validateOrder(
      DEFAULT_RISK,
      { ticker: "AAPL", side: "buy", quantity: 1, estimatedNotionalUsd: 100 },
      { ...baseCtx, dataQualityOk: false },
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.check).toBe("data_quality");
  });

  it("kill switch blocks new buys at drawdown but permits de-risking sells", () => {
    const ctx = { ...baseCtx, cashUsd: 80_000, peakPortfolioValueUsd: 100_000 }; // 20% DD
    const cfg: RiskConfig = { ...DEFAULT_RISK, drawdownKillSwitchPct: 0.15 };
    const buy = validateOrder(cfg, { ticker: "AAPL", side: "buy", quantity: 10, estimatedNotionalUsd: 1_000 }, ctx);
    expect(buy.ok).toBe(false);
    if (!buy.ok) {
      expect(buy.check).toBe("drawdown_kill_switch");
      expect(buy.reason).toMatch(/20\.0%/); // percent rendered correctly (regression)
    }
    const sell = validateOrder(cfg, { ticker: "AAPL", side: "sell", quantity: 10, estimatedNotionalUsd: 1_000 }, ctx);
    expect(sell.ok).toBe(true);
  });

  it("flags concentration warnings without blocking", () => {
    const warn = concentrationWarnings(
      [{ ticker: "AAPL", valueUsd: 60_000 }],
      100_000,
      DEFAULT_RISK,
    );
    expect(warn).toHaveLength(1);
    expect(warn[0]).toMatch(/25%/);
  });
});
