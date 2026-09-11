import { macroQuotes, sectorPerformance, yahooChart } from "@core/research/providers";
import DashboardClient from "@/components/market/DashboardClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const INDICES = ["^GSPC", "^IXIC", "^DJI", "^VIX"] as const;
const MOVERS = ["NVDA", "AAPL", "MSFT", "GOOGL", "TSLA", "AMZN", "META", "AMD"] as const;

async function safeQuote(ticker: string) {
  try {
    const { quote } = await yahooChart(ticker, "5d", "1d");
    return { ticker, name: quote.name, price: quote.price, changePct: quote.changePct, prevClose: quote.prevClose };
  } catch {
    return { ticker, name: null, price: null, changePct: null, prevClose: null };
  }
}

export default async function DashboardPage() {
  const [indices, movers, macro, sectors] = await Promise.all([
    Promise.all(INDICES.map(safeQuote)),
    Promise.all(MOVERS.map(safeQuote)),
    macroQuotes().catch(() => []),
    sectorPerformance().catch(() => null),
  ]);

  return (
    <DashboardClient
      indices={indices.map((i) => ({
        ticker: i.ticker,
        name: i.name ?? i.ticker,
        price: i.price,
        changePct: i.changePct,
      }))}
      movers={movers}
      macroCount={macro.length}
      sectorNote={sectors ? "Sector data available" : "Sector data unavailable"}
    />
  );
}
