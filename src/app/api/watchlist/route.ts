import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/guard";
import {
  forecastAudit,
  pendingForecasts,
  resolveForecast,
  watchlistAdd,
  watchlistRemove,
  watchlistTickers,
} from "@core/research/store";
import { yahooChart } from "@core/research/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/watchlist — watchlist + forecast audit (§22). */
export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const items = watchlistTickers();
  const rows = await Promise.all(
    items.map(async (w) => {
      try {
        const { quote } = await yahooChart(w.ticker, "5d", "1d");
        return { ...w, price: quote.price, changePct: quote.changePct, name: quote.name };
      } catch {
        return { ...w, price: null, changePct: null, name: null };
      }
    }),
  );
  return NextResponse.json({ ok: true, items: rows, audit: forecastAudit() });
}

/** POST /api/watchlist — add ticker (guarded). */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = z
    .object({ ticker: z.string().min(1).max(10).regex(/^[A-Za-z^.\-=]{1,10}$/), note: z.string().max(300).optional() })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid ticker" }, { status: 400 });
  }
  watchlistAdd(parsed.data.ticker, parsed.data.note);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/watchlist — remove ticker (guarded). */
export async function DELETE(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const ticker = url.searchParams.get("ticker") ?? "";
  if (!/^[A-Za-z^.\-=]{1,10}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "invalid ticker" }, { status: 400 });
  }
  watchlistRemove(ticker);
  return NextResponse.json({ ok: true });
}

/** POST /api/watchlist/resolve — resolve matured forecasts against live prices (§22). */
export async function PUT() {
  const pending = pendingForecasts();
  let resolved = 0;
  for (const f of pending) {
    try {
      const { quote } = await yahooChart(f.ticker, "5d", "1d");
      if (quote.price != null && resolveForecast(f.id, quote.price)) resolved += 1;
    } catch {
      // skip; stays pending
    }
  }
  return NextResponse.json({ ok: true, resolved, pending: pending.length });
}
