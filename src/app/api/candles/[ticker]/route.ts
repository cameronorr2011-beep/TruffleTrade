import { NextResponse } from "next/server";
import { resolveCandles } from "@core/data/plugins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGES = ["1D", "5D", "1M", "6M", "1Y", "5Y"];

export type CandlePayload = {
  ticker: string;
  range: string;
  candles: { t: number; o: number; h: number; l: number; c: number; v: number | null }[];
  prevClose: number | null;
  asOf: number | null;
  currency: string | null;
  name: string | null;
  exchange: string | null;
  provider: string;
};

// Small process cache so a dashboard of charts doesn't hammer public endpoints.
const cache = new Map<string, { at: number; data: CandlePayload }>();
const TTL_MS: Record<string, number> = {
  "1D": 60_000, // intraday quotes move fast
  "5D": 120_000,
  "1M": 5 * 60_000,
  "6M": 10 * 60_000,
  "1Y": 10 * 60_000,
  "5Y": 30 * 60_000,
};

export async function GET(req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).trim().toUpperCase().slice(0, 12);
  if (!/^[A-Z0-9.\-^=]{1,12}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "invalid ticker" }, { status: 400 });
  }

  const url = new URL(req.url);
  const range = RANGES.includes(url.searchParams.get("range") ?? "") ? (url.searchParams.get("range") as string) : "1M";

  const key = `${ticker}:${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (TTL_MS[range] ?? 300_000)) {
    return NextResponse.json({ ok: true, cached: true, ...hit.data });
  }

  const r = await resolveCandles(ticker, range);
  if (!r.ok || r.candles.length === 0) {
    return NextResponse.json(
      { ok: false, error: r.ok ? "no data for ticker" : `market data unavailable (${r.reason})` },
      { status: 502 },
    );
  }

  const last = r.candles[r.candles.length - 1];
  const prev = r.candles[r.candles.length - 2];
  const payload: CandlePayload = {
    ticker,
    range,
    candles: r.candles.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v ?? null })),
    prevClose: r.quote.prevClose ?? (prev ? prev.c : null),
    asOf: last ? last.t : null,
    currency: r.quote.currency ?? "USD",
    name: r.quote.name ?? null,
    exchange: r.quote.exchange ?? null,
    provider: r.provider,
  };
  cache.set(key, { at: Date.now(), data: payload });
  return NextResponse.json({ ok: true, cached: false, ...payload });
}
