import { NextResponse } from "next/server";
import { buildDataPack } from "@core/research/datapack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/securities/:ticker — market data + fundamentals + news, no AI. */
export async function GET(_req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  try {
    const pack = await buildDataPack(ticker);
    if (pack.quote.price == null && pack.candles1d.length === 0) {
      return NextResponse.json(
        { ok: false, error: `DATA UNAVAILABLE for "${ticker}" — not a valid ticker or source down` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, dataPack: pack });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
