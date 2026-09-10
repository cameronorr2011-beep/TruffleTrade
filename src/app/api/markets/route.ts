import { NextResponse } from "next/server";
import { macroQuotes, sectorPerformance } from "@core/research/providers";
import { yahooChart } from "@core/research/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/markets — terminal dashboard data; useful without AI (spec §16). */
export async function GET() {
  try {
    const [macro, sectors, indices] = await Promise.all([
      macroQuotes().catch(() => []),
      sectorPerformance().catch(() => []),
      Promise.all(
        ["^GSPC", "^IXIC", "^DJI", "^RUT"].map(async (s) => {
          try {
            const { quote } = await yahooChart(s, "5d", "1d");
            return { symbol: s, price: quote.price, changePct: quote.changePct, asOf: quote.asOf };
          } catch {
            return { symbol: s, price: null, changePct: null, asOf: null };
          }
        }),
      ),
    ]);
    const movers = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO"].map(async (t) => {
      try {
        const { quote } = await yahooChart(t, "5d", "1d");
        return { ticker: t, name: quote.name, price: quote.price, changePct: quote.changePct };
      } catch {
        return { ticker: t, name: null, price: null, changePct: null };
      }
    });
    return NextResponse.json({
      ok: true,
      indices,
      macro,
      sectors: sectors.sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999)),
      movers: await Promise.all(movers),
      asOf: Date.now(),
      dataAsOfLabel: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" }) + " ET",
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
