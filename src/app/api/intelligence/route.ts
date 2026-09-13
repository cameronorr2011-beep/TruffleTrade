import { NextResponse } from "next/server";
import { twinConfidence, newsSentiment, macroSentiment, predictMarket } from "@core/research/marketIntelligence";
import { yahooChart } from "@core/research/providers";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();

export async function GET(req: Request) {
  // Paid product intelligence — gated like the AI routes. The local desktop
  // app passes the subscriber's stored code via x-access-code.
  const denied = await guard(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const ticker = (url.searchParams.get("ticker") ?? "").trim().toUpperCase().slice(0, 12);
  if (!/^[A-Z0-9.\-^=]{1,12}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "invalid ticker" }, { status: 400 });
  }

  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ok: true, cached: true, ...(hit.data as object) });
  }

  try {
    const chart = await yahooChart(ticker, "1y", "1d").catch(() => null);
    const closes = chart?.candles.map((c) => c.close) ?? [];

    const [twin, news, macro, prediction] = await Promise.all([
      Promise.resolve(
        closes.length >= 60
          ? twinConfidence(ticker, closes)
          : null,
      ),
      newsSentiment(ticker),
      macroSentiment(),
      predictMarket(ticker),
    ]);

    const data = {
      twin,
      twinUnavailable: twin ? null : "insufficient price history (need 60+ closes)",
      news,
      macro,
      prediction,
      generatedAt: Date.now(),
    };
    cache.set(ticker, { at: Date.now(), data });
    return NextResponse.json({ ok: true, cached: false, ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `intelligence failed: ${(e as Error).message}` }, { status: 500 });
  }
}
