import { NextResponse } from "next/server";
import { yahooChart } from "@core/research/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Interval → Yahoo range params. */
const RANGES: Record<string, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" },
  "5D": { range: "5d", interval: "15m" },
  "1M": { range: "1mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "5Y": { range: "5y", interval: "1wk" },
};

export type CandlePayload = {
  ticker: string;
  range: string;
  candles: { t: number; o: number; h: number; l: number; c: number; v: number | null }[];
  prevClose: number | null;
  asOf: number | null;
  currency: string | null;
  name: string | null;
  exchange: string | null;
};

// Small process cache so a dashboard of charts doesn't hammer Yahoo.
const cache = new Map<string, { at: number; data: CandlePayload }>();
const TTL_MS: Record<string, number> = {
  "1D": 60_000, // intraday quotes move fast
  "5D": 120_000,
  "1M": 5 * 60_000,
  "6M": 10 * 60_000,
  "1Y": 10 * 60_000,
  "5Y": 30 * 60_000,
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).trim().toUpperCase().slice(0, 12);
  if (!/^[A-Z0-9.\-^=]{1,12}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "invalid ticker" }, { status: 400 });
  }

  const url = new URL(req.url);
  const range = RANGES[url.searchParams.get("range") ?? ""] ? (url.searchParams.get("range") as string) : "1M";
  const { range: yRange, interval } = RANGES[range];

  const key = `${ticker}:${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (TTL_MS[range] ?? 300_000)) {
    return NextResponse.json({ ok: true, cached: true, ...hit.data });
  }

  try {
    const { quote, candles } = await yahooChart(ticker, yRange, interval);
    if (candles.length === 0 && quote.price == null) {
      return NextResponse.json({ ok: false, error: "no data for ticker" }, { status: 404 });
    }
    const payload: CandlePayload = {
      ticker,
      range,
      candles: candles.map((c) => ({ t: c.ts, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume ?? null })),
      prevClose: quote.prevClose ?? null,
      asOf: quote.asOf ?? null,
      currency: quote.currency ?? null,
      name: quote.name ?? null,
      exchange: quote.exchange ?? null,
    };
    cache.set(key, { at: Date.now(), data: payload });
    return NextResponse.json({ ok: true, cached: false, ...payload });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `market data unavailable: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
