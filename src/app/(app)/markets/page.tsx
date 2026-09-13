import { macroQuotes, sectorPerformance, yahooChart } from "@core/research/providers";

export const dynamic = "force-dynamic";

const INDICES = ["^GSPC", "^IXIC", "^DJI", "^RUT", "^VIX", "^TNX"];
const MOVERS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO"];

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function price(n: number | null): string {
  if (n == null) return "DATA UNAVAILABLE";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

async function safeQuote(s: string) {
  try {
    const { quote } = await yahooChart(s, "5d", "1d");
    return { symbol: s, price: quote.price, changePct: quote.changePct, name: quote.name };
  } catch {
    return { symbol: s, price: null, changePct: null, name: null };
  }
}

export default async function MarketsPage() {
  const [indices, movers, sectors, macro] = await Promise.all([
    Promise.all(INDICES.map(safeQuote)),
    Promise.all(MOVERS.map(safeQuote)),
    sectorPerformance().catch(() => []),
    macroQuotes().catch(() => []),
  ]);
  const sortedSectors = [...sectors].sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));
  const worst = [...sortedSectors].reverse();
  const moversSorted = [...movers].sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-16 pt-4 sm:px-8">
      <div className="tt-pageband">
        <div>
          <p className="tt-eyebrow">Market dashboard</p>
          <h1 style={{ margin: 0 }}>
            <span className="tt-page-title">Markets</span>
          </h1>
        </div>
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          keyless · yahoo finance · {new Date().toLocaleDateString("en-US")}
        </p>
      </div>

      {/* Indices */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {indices.map((i) => (
          <div key={i.symbol} className="card flex items-baseline justify-between px-5 py-4">
            <div>
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-faint">{i.symbol}</p>
              <p className="font-display mt-1 text-[1.5rem] font-semibold text-ink">{price(i.price)}</p>
            </div>
            <p className={`font-mono text-[0.8rem] ${(i.changePct ?? 0) >= 0 ? "text-jade" : "text-blood"}`}>
              {pct(i.changePct)}
            </p>
          </div>
        ))}
      </section>

      {/* Sectors */}
      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">Sector performance</h2>
          <ul className="mt-4 space-y-2">
            {sortedSectors.map((s) => (
              <li key={s.symbol} className="flex items-center gap-3">
                <span className="w-44 shrink-0 font-mono text-[0.7rem] text-bone-soft">{s.label}</span>
                <div className="h-2 flex-1 rounded-full bg-soil-900">
                  <div
                    className={`h-2 rounded-full ${(s.changePct ?? 0) >= 0 ? "bg-jade" : "bg-blood"}`}
                    style={{ width: `${Math.min(100, Math.abs(s.changePct ?? 0) * 20 + 4)}%` }}
                  />
                </div>
                <span className={`w-16 text-right font-mono text-[0.7rem] ${(s.changePct ?? 0) >= 0 ? "text-jade" : "text-blood"}`}>
                  {pct(s.changePct)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-6">
          <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">Macro tape</h2>
          <table className="mt-4 w-full text-left">
            <tbody>
              {macro.map((m) => (
                <tr key={m.symbol} className="border-b border-soil-600 last:border-0">
                  <td className="py-2 font-mono text-[0.72rem] text-bone-soft">{m.label}</td>
                  <td className="py-2 text-right font-mono text-[0.72rem] text-ink">{price(m.price)}</td>
                  <td className={`py-2 text-right font-mono text-[0.72rem] ${(m.changePct ?? 0) >= 0 ? "text-jade" : "text-blood"}`}>
                    {pct(m.changePct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Movers */}
      <section className="card mt-5 p-6">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">
          Mega-cap movers
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {moversSorted.map((m) => (
            <a
              key={m.symbol}
              href={`/company/${m.symbol}`}
              className="rounded-xl border border-soil-600 bg-soil-950 px-4 py-3 transition-colors hover:border-forest/35"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[0.78rem] font-semibold text-ink">{m.symbol}</span>
                <span className={`font-mono text-[0.72rem] ${(m.changePct ?? 0) >= 0 ? "text-jade" : "text-blood"}`}>
                  {pct(m.changePct)}
                </span>
              </div>
              <p className="mt-1 font-mono text-[0.72rem] text-bone-soft">{price(m.price)}</p>
              <p className="mt-0.5 truncate font-mono text-[0.58rem] text-faint">{m.name ?? ""}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
