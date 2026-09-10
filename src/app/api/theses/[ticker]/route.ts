import { NextResponse } from "next/server";
import { thesisHistory } from "@core/research/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/theses/:ticker — versioned thesis history (§21). */
export async function GET(_req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  const history = thesisHistory(ticker, 50);
  if (!history.length) {
    return NextResponse.json({ ok: false, error: `no thesis history for ${ticker}` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ticker: ticker.toUpperCase(), history });
}
