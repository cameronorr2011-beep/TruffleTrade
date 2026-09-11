// Deterministic risk engine (spec §20). Runs BEFORE any simulated action.
// AI recommendations cannot override these rules — they have no input here.

export interface RiskConfig {
  maxPositionPctOfPortfolio: number; // 0..1
  maxTotalExposurePct: number; // invested share of portfolio, 0..1
  maxSingleOrderNotionalUsd: number;
  drawdownKillSwitchPct: number; // from peak portfolio value
}

export const DEFAULT_RISK: RiskConfig = {
  maxPositionPctOfPortfolio: Number(process.env.PAPER_MAX_POSITION_PCT?.trim() || 0.25),
  maxTotalExposurePct: Number(process.env.PAPER_MAX_EXPOSURE_PCT?.trim() || 0.9),
  maxSingleOrderNotionalUsd: Number(process.env.PAPER_MAX_ORDER_USD?.trim() || 25_000),
  drawdownKillSwitchPct: Number(process.env.KILL_SWITCH_DD?.trim() || 0.15),
};

export interface RiskContext {
  cashUsd: number;
  positionsValueUsd: number;
  peakPortfolioValueUsd: number;
  existingPositionQty: number;
  existingPositionAvgCost: number;
  markPrice: number; // current price for the order's ticker
  dataQualityOk: boolean; // price is fresh + from a known provider
}

export type RiskVerdict =
  | { ok: true; checks: string[] }
  | { ok: false; reason: string; check: string };

export function validateOrder(
  cfg: RiskConfig,
  order: { ticker: string; side: "buy" | "sell"; quantity: number; estimatedNotionalUsd: number },
  ctx: RiskContext,
): RiskVerdict {
  const checks: string[] = [];
  const portfolioValue = ctx.cashUsd + ctx.positionsValueUsd;
  if (!Number.isFinite(portfolioValue) || portfolioValue <= 0) {
    return { ok: false, reason: "portfolio value invalid", check: "portfolio_integrity" };
  }

  // Kill switch: drawdown from peak halts NEW buys (sells remain allowed to de-risk).
  const dd = ctx.peakPortfolioValueUsd > 0 ? 1 - portfolioValue / ctx.peakPortfolioValueUsd : 0;
  if (dd >= cfg.drawdownKillSwitchPct) {
    if (order.side === "buy") {
      return {
        ok: false,
        reason: `KILL SWITCH: drawdown ${(dd * 100).toFixed(1)}% ≥ ${(cfg.drawdownKillSwitchPct * 100).toFixed(0)}% — new buys blocked`,
        check: "drawdown_kill_switch",
      };
    }
    checks.push(`kill-switch active — sells permitted (de-risking)`);
  }

  if (!ctx.dataQualityOk) {
    return { ok: false, reason: "market data stale or unverified — order blocked", check: "data_quality" };
  }

  if (order.quantity <= 0 || !Number.isFinite(order.quantity)) {
    return { ok: false, reason: "quantity must be positive", check: "input_integrity" };
  }
  if (order.estimatedNotionalUsd > cfg.maxSingleOrderNotionalUsd) {
    return {
      ok: false,
      reason: `order notional $${order.estimatedNotionalUsd.toFixed(0)} exceeds per-order cap $${cfg.maxSingleOrderNotionalUsd.toFixed(0)}`,
      check: "max_order_notional",
    };
  }

  if (order.side === "buy") {
    const newValue = (ctx.existingPositionQty * ctx.existingPositionAvgCost + order.estimatedNotionalUsd) / portfolioValue;
    if (newValue > cfg.maxPositionPctOfPortfolio + 1e-9) {
      return {
        ok: false,
        reason: `position would be ${(newValue * 100).toFixed(1)}% of portfolio > cap ${(cfg.maxPositionPctOfPortfolio * 100).toFixed(0)}%`,
        check: "max_position_size",
      };
    }
    const exposureAfter = (ctx.positionsValueUsd + order.estimatedNotionalUsd) / portfolioValue;
    if (exposureAfter > cfg.maxTotalExposurePct + 1e-9) {
      return {
        ok: false,
        reason: `total exposure would be ${(exposureAfter * 100).toFixed(1)}% > cap ${(cfg.maxTotalExposurePct * 100).toFixed(0)}%`,
        check: "max_exposure",
      };
    }
    if (order.estimatedNotionalUsd > ctx.cashUsd) {
      return { ok: false, reason: "order exceeds available cash", check: "cash" };
    }
  }
  return { ok: true, checks };
}

/** Concentration warning (non-blocking) for portfolio views. */
export function concentrationWarnings(positions: { ticker: string; valueUsd: number }[], portfolioValueUsd: number, cfg: RiskConfig): string[] {
  if (portfolioValueUsd <= 0) return [];
  return positions
    .filter((p) => p.valueUsd / portfolioValueUsd > cfg.maxPositionPctOfPortfolio)
    .map((p) => `${p.ticker} is ${((p.valueUsd / portfolioValueUsd) * 100).toFixed(1)}% of portfolio (cap ${(cfg.maxPositionPctOfPortfolio * 100).toFixed(0)}%) — concentration warning`);
}
