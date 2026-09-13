import { NextResponse } from "next/server";
import { streetRatings } from "@core/research/providers";
import { yahooChart } from "@core/research/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/street?ticker=AAPL — sell-side consensus (counts + price targets)
 * alongside the live price. Keyless public data (no AI burned), labeled as
 * THIRD-PARTY OPINION. Failures return ok:false — nothing is invented.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = (url.searchParams.get("ticker") ?? "").trim().toUpperCase().slice(0, 12);
  if (!/^[A-Z0-9.\-^=]{1,12}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "invalid ticker" }, { status: 400 });
  }
  const [ratings, chart] = await Promise.all([
    streetRatings(ticker).catch(() => null),
    yahooChart(ticker, "5d", "1d").catch(() => null),
  ]);
  if (!ratings) {
    return NextResponse.json({ ok: false, error: "analyst consensus unavailable for this ticker" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    ratings,
    price: chart?.quote.price ?? null,
    label: "THIRD-PARTY OPINION",
    disclaimer: "Analyst counts and targets are third-party consensus, refreshed by the provider — not TruffleTrade analysis and not investment advice.",
  });
}
