import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();

interface YahooSearchResult {
  quotes: {
    symbol?: string;
    shortname?: string;
    longname?: string;
    exch?: string;
    exchDisp?: string;
    quoteType?: string;
    score?: number;
  }[];
}

/**
 * GET /api/search?q=nvidia — keyless Yahoo search embed. Lets the user pick
 * any tradeable symbol by name or ticker; the picked symbol drives the chart,
 * the twin simulation, and the council.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40);
  if (q.length < 1) {
    return NextResponse.json({ ok: false, error: "query required" }, { status: 400 });
  }

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ok: true, cached: true, ...(hit.data as object) });
  }

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TruffleTrade/1.0)", Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as YahooSearchResult;
    const results = (j.quotes ?? [])
      .filter((r) => r.symbol && ["EQUITY", "ETF", "INDEX", "CRYPTOCURRENCY"].includes(r.quoteType ?? ""))
      .slice(0, 8)
      .map((r) => ({
        symbol: r.symbol!,
        name: r.longname ?? r.shortname ?? r.symbol!,
        exchange: r.exchDisp ?? r.exch ?? null,
        type: r.quoteType ?? null,
      }));
    const data = { results };
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json({ ok: true, cached: false, ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `search unavailable: ${(e as Error).message}` }, { status: 502 });
  }
}
