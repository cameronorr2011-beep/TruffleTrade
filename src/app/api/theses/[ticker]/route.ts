import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { thesisHistory } from "@core/research/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/theses/:ticker — versioned thesis history (§21). Paid product output — gated. */
export async function GET(req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { ticker } = await ctx.params;
  const history = thesisHistory(ticker, 50);
  if (!history.length) {
    return NextResponse.json({ ok: false, error: `no thesis history for ${ticker}` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ticker: ticker.toUpperCase(), history });
}
