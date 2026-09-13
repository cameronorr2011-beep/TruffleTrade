import { yahooChart } from "@core/research/providers";
import LiveQuotes from "@/components/market/LiveQuotes";
import AlertsPanel from "@/components/app/AlertsPanel";
import IntelligenceHub from "@/components/app/IntelligenceHub";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview · TruffleTrade" };

const INDICES = ["^GSPC", "^IXIC", "^DJI", "^VIX"] as const;
const MOVERS = ["NVDA", "AAPL", "MSFT", "GOOGL", "TSLA", "AMZN", "META", "AMD"] as const;

async function safeQuote(ticker: string) {
  try {
    const { quote } = await yahooChart(ticker, "5d", "1d");
    return { ticker, name: quote.name, price: quote.price, changePct: quote.changePct };
  } catch {
    return { ticker, name: null, price: null, changePct: null };
  }
}

export default async function DashboardPage() {
  const [indices, movers] = await Promise.all([Promise.all(INDICES.map(safeQuote)), Promise.all(MOVERS.map(safeQuote))]);

  return (
    <div className="tt-stack">
      <header className="tt-pageband">
        <div>
          <p className="tt-eyebrow">Overview</p>
          <h1 className="tt-page-title">Less noise. More signal.</h1>
          <p className="tt-sub">
            Live candles, real-time quotes, deterministic alerts, and headlines the AI actually reads — one quiet terminal.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a href="/research" className="tt-btn tt-btn-primary">Run analysis</a>
          <a href="/markets" className="tt-btn tt-btn-ghost">Markets</a>
        </div>
      </header>

      <LiveQuotes
        initialIndices={indices.map((i) => ({
          ticker: i.ticker,
          name: i.name ?? i.ticker,
          price: i.price,
          changePct: i.changePct,
        }))}
        initialMovers={movers}
        initialTicker="NVDA"
      />
      <AlertsPanel tickers="NVDA,AAPL,MSFT,TSLA,AMD" />

      <IntelligenceHub initialTicker="NVDA" />

      <p className="tt-faint" style={{ fontSize: 10.5 }}>
        Market data is keyless and no-KYC (Yahoo, Stooq, Kraken public endpoints); quotes are delayed per exchange
        rules. Everything here is research, not investment advice.
      </p>
    </div>
  );
}
