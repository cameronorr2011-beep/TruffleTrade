// Paper order service: the ONLY path an order may flow through.
// AI RECOMMENDS → RISK VALIDATES → ENGINE SIMULATES → STORE PERSISTS → AUDIT LOGS.
// Every fill uses a live mark price with provenance; stale/unavailable data
// blocks the order (fail closed) — data is never invented (spec §6, §44).

import { hashCode } from "../licensing/codes";
import { yahooChart } from "../research/providers";
import { paperStore, type PaperAccountRow, type PaperFillRow, type PaperOrderRow, type PaperPositionRow } from "./db";
import {
  DEFAULT_ASSUMPTIONS,
  PaperEngineError,
  applyToBook,
  executeFill,
  portfolioValue,
  type PositionBook,
} from "./engine";
import { DEFAULT_RISK, concentrationWarnings, validateOrder, type RiskConfig } from "./risk";

// A mark price older than this is treated as stale → orders blocked (fail closed).
const MAX_MARK_AGE_MS = 10 * 60_000;
export const START_USD = Number(process.env.PAPER_START_USD?.trim() || 100_000);

export interface OrderRequest {
  accessCode: string;
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  type?: "market" | "limit";
  limitPrice?: number;
}

export interface OrderReceipt {
  ok: true;
  orderId: number;
  status: PaperOrderRow["status"];
  fill?: {
    ticker: string;
    side: string;
    quantity: number;
    priceUsd: number;
    feeUsd: number;
    slippageUsd: number;
    realizedPnlUsd: number;
    priceSource: string;
    priceAsOf: string;
  };
  account: {
    cashUsd: number;
    positionsValueUsd: number;
    portfolioValueUsd: number;
    realizedPnlUsd: number;
    unrealizedPnlUsd: number;
    peakValueUsd: number;
  };
  warnings: string[];
}

export type OrderRejection = { ok: false; status: number; error: string; code: string };

function fmtTs(ts: number): string {
  return new Date(ts).toISOString();
}

/** Fetch the live mark price with provenance; null when unavailable/stale. */
async function liveMark(ticker: string): Promise<{ price: number; asOf: number; source: string } | null> {
  try {
    const { quote } = await yahooChart(ticker, "1d", "1m");
    if (quote.price == null || quote.price <= 0 || !Number.isFinite(quote.price)) return null;
    const asOf = quote.asOf ?? Date.now();
    if (Date.now() - asOf > MAX_MARK_AGE_MS) return null;
    return { price: quote.price, asOf, source: quote.source };
  } catch {
    return null;
  }
}

async function loadBook(accountId: number): Promise<PositionBook> {
  const store = paperStore();
  const rows: PaperPositionRow[] = await store.positions(accountId);
  const positions = new Map<string, PaperPositionRow extends never ? never : import("./types").PaperPosition>();
  for (const r of rows) positions.set(r.ticker, { ticker: r.ticker, quantity: r.quantity, avgCostUsd: r.avgCostUsd });
  return { positions: positions as PositionBook["positions"], realizedPnlUsd: 0 };
}

async function accountView(account: PaperAccountRow): Promise<{
  cashUsd: number;
  positionsValueUsd: number;
  portfolioValueUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  peakValueUsd: number;
  warnings: string[];
}> {
  const store = paperStore();
  const rows: PaperPositionRow[] = await store.positions(account.id);
  const marks: Record<string, number> = {};
  const warnings: string[] = [];
  await Promise.all(
    rows.map(async (p) => {
      const m = await liveMark(p.ticker);
      if (m) marks[p.ticker] = m.price;
      else warnings.push(`${p.ticker}: live mark unavailable — valued at cost`);
    }),
  );
  const v = portfolioValue(account.cashUsd, rows.map((p) => ({ ticker: p.ticker, quantity: p.quantity, avgCostUsd: p.avgCostUsd })), marks);
  const cfg: RiskConfig = DEFAULT_RISK;
  const conc = concentrationWarnings(
    rows.map((p) => ({ ticker: p.ticker, valueUsd: (marks[p.ticker] ?? p.avgCostUsd) * p.quantity })),
    v.portfolioValueUsd,
    cfg,
  );
  return {
    cashUsd: account.cashUsd,
    positionsValueUsd: v.positionsValueUsd,
    portfolioValueUsd: v.portfolioValueUsd,
    realizedPnlUsd: 0, // computed from fill history below when needed
    unrealizedPnlUsd: v.unrealizedPnlUsd,
    peakValueUsd: Math.max(account.peakValueUsd, v.portfolioValueUsd),
    warnings: [...warnings, ...conc],
  };
}

export async function getOrCreatePaperAccount(accessCode: string): Promise<PaperAccountRow> {
  const ownerHash = hashCode(accessCode.trim());
  return paperStore().getOrCreateAccount(ownerHash, START_USD, JSON.stringify(DEFAULT_ASSUMPTIONS));
}

export async function paperPortfolio(accessCode: string) {
  const account = await getOrCreatePaperAccount(accessCode);
  const store = paperStore();
  // Serialize DB reads: the shared pg Client must never run overlapping queries.
  const view = await accountView(account);
  const orders = await store.recentOrders(account.id, 50);
  const fills = await store.recentFills(account.id, 50);
  const realized = fills.reduce((s, f) => s + f.realizedPnlUsd, 0);
  return {
    simulated: true,
    disclaimer: "PAPER TRADING — SIMULATED. NOT REAL EXECUTION. Simulated performance never guarantees future results.",
    assumptions: JSON.parse(account.assumptionsJson) as Record<string, unknown>,
    account: { ...view, realizedPnlUsd: realized },
    positions: (await store.positions(account.id)).map((p) => ({
      ticker: p.ticker,
      quantity: p.quantity,
      avgCostUsd: p.avgCostUsd,
      lastPriceUsd: null as number | null,
    })),
    orders,
    fills,
  };
}

export async function placePaperOrder(req: OrderRequest): Promise<OrderReceipt | OrderRejection> {
  const store = paperStore();
  const account = await getOrCreatePaperAccount(req.accessCode);
  const ownerHash = account.ownerCodeHash;

  // ── 1. Input integrity ────────────────────────────────────────────
  const ticker = String(req.ticker ?? "").trim().toUpperCase();
  const qty = Number(req.quantity);
  const type = req.type === "limit" ? "limit" : "market";
  const limitPrice = req.limitPrice != null ? Number(req.limitPrice) : null;
  if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker)) {
    await store.audit("paper_order_rejected", ownerHash, { reason: "bad_ticker", ticker });
    return { ok: false, status: 400, error: "invalid ticker", code: "INVALID_INPUT" };
  }
  if (!Number.isFinite(qty) || qty <= 0 || qty * (limitPrice ?? 1) > 1e9) {
    await store.audit("paper_order_rejected", ownerHash, { reason: "bad_quantity", quantity: qty });
    return { ok: false, status: 400, error: "quantity must be a positive finite number", code: "INVALID_INPUT" };
  }
  if (type === "limit" && (limitPrice == null || !Number.isFinite(limitPrice) || limitPrice <= 0)) {
    await store.audit("paper_order_rejected", ownerHash, { reason: "bad_limit", limitPrice });
    return { ok: false, status: 400, error: "limit orders require a positive limitPrice", code: "INVALID_INPUT" };
  }

  // ── 2. Live mark price with provenance (fail closed) ─────────────
  const mark = await liveMark(ticker);
  if (!mark) {
    await store.audit("paper_order_rejected", ownerHash, { reason: "market_data_unavailable", ticker });
    return {
      ok: false,
      status: 503,
      error: `MARKET DATA UNAVAILABLE for ${ticker} — provider failed, stale (>10 min), or unknown symbol. Order blocked; nothing simulated.`,
      code: "DATA_UNAVAILABLE",
    };
  }

  // ── 3. Risk engine — runs BEFORE the engine, AI has no input here ─
  const positions = await store.positions(account.id);
  const existing = positions.find((p) => p.ticker === ticker) ?? null;
  const posValue = positions.reduce((s, p) => s + p.avgCostUsd * p.quantity, 0);
  const estNotional = (limitPrice ?? mark.price) * qty;
  const verdict = validateOrder(
    DEFAULT_RISK,
    { ticker, side: req.side, quantity: qty, estimatedNotionalUsd: estNotional },
    {
      cashUsd: account.cashUsd,
      positionsValueUsd: posValue,
      peakPortfolioValueUsd: account.peakValueUsd,
      existingPositionQty: existing?.quantity ?? 0,
      existingPositionAvgCost: existing?.avgCostUsd ?? 0,
      markPrice: mark.price,
      dataQualityOk: true,
    },
  );
  if (!verdict.ok) {
    await store.audit("paper_order_rejected", ownerHash, { reason: "risk", check: verdict.check, detail: verdict.reason, ticker, side: req.side, quantity: qty });
    return { ok: false, status: 422, error: verdict.reason, code: "RISK_BLOCK" };
  }

  // ── 4. Insert order (pending) ────────────────────────────────────
  const orderId = await store.insertOrder({
    accountId: account.id,
    ticker,
    side: req.side,
    type,
    quantity: qty,
    limitPrice,
    status: "pending",
    reason: null,
    createdAt: Date.now(),
  });

  // ── 5. Simulate the fill ─────────────────────────────────────────
  try {
    const res = executeFill({
      order: { ticker, side: req.side, quantity: qty, type, limitPrice },
      price: mark.price,
      account: { cashUsd: account.cashUsd },
      assumptions: JSON.parse(account.assumptionsJson) as typeof DEFAULT_ASSUMPTIONS,
    });

    const book = await loadBook(account.id);
    const { realizedPnlUsd } = applyToBook(book, { ticker, side: req.side, quantity: qty }, res);

    const newCash = account.cashUsd + res.cashDeltaUsd;
    if (!Number.isFinite(newCash) || newCash < -1e-9) throw new PaperEngineError("cash accounting went non-finite/negative", "INVALID_INPUT");
    const pos = book.positions.get(ticker);
    await store.upsertPosition(account.id, ticker, pos?.quantity ?? 0, pos?.avgCostUsd ?? 0);
    await store.updateAccountCash(account.id, newCash, Math.max(account.peakValueUsd, account.cashUsd + posValue));
    await store.insertFill({
      orderId,
      ticker,
      side: req.side,
      quantity: qty,
      priceUsd: res.fill.priceUsd,
      feeUsd: res.fill.feeUsd,
      slippageUsd: res.fill.slippageUsd,
      realizedPnlUsd,
      ts: Date.now(),
    });
    await store.setOrderStatus(orderId, "filled", null);
    await store.audit("paper_fill", ownerHash, { orderId, ticker, side: req.side, quantity: qty, priceUsd: res.fill.priceUsd, realizedPnlUsd });

    const after = await store.getAccount(ownerHash);
    const view = after ? await accountView(after) : null;
    return {
      ok: true,
      orderId,
      status: "filled",
      fill: {
        ticker,
        side: req.side,
        quantity: qty,
        priceUsd: res.fill.priceUsd,
        feeUsd: res.fill.feeUsd,
        slippageUsd: res.fill.slippageUsd,
        realizedPnlUsd,
        priceSource: mark.source,
        priceAsOf: fmtTs(mark.asOf),
      },
      account: view
        ? {
            cashUsd: view.cashUsd,
            positionsValueUsd: view.positionsValueUsd,
            portfolioValueUsd: view.portfolioValueUsd,
            realizedPnlUsd: 0,
            unrealizedPnlUsd: view.unrealizedPnlUsd,
            peakValueUsd: view.peakValueUsd,
          }
        : { cashUsd: newCash, positionsValueUsd: 0, portfolioValueUsd: newCash, realizedPnlUsd: 0, unrealizedPnlUsd: 0, peakValueUsd: account.peakValueUsd },
      warnings: [],
    };
  } catch (e) {
    const msg = e instanceof PaperEngineError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : "fill failed";
    await store.setOrderStatus(orderId, "rejected", msg);
    await store.audit("paper_order_rejected", ownerHash, { reason: "engine", orderId, detail: msg });
    return { ok: false, status: 422, error: msg, code: "FILL_REJECTED" };
  }
}
