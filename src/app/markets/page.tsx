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
    <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-10 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/75">
            Market dashboard
          </span>
          <h1 className="font-display mt-2 text-[clamp(1.9rem,4vw,3rem)] font-semibold text-bone">Markets</h1>
        </div>
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-bone/35">
          keyless · yahoo finance · {new Date().toLocaleDateString("en-US")}
        </p>
      </div>

      {/* Indices */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {indices.map((i) => (
          <div key={i.symbol} className="card flex items-baseline justify-between px-5 py-4">
            <div>
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-bone/45">{i.symbol}</p>
              <p className="font-display mt-1 text-[1.5rem] font-semibold text-bone">{price(i.price)}</p>
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
          <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/50">Sector performance</h2>
          <ul className="mt-4 space-y-2">
            {sortedSectors.map((s) => (
              <li key={s.symbol} className="flex items-center gap-3">
                <span className="w-44 shrink-0 font-mono text-[0.7rem] text-bone/65">{s.label}</span>
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
          <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/50">Macro tape</h2>
          <table className="mt-4 w-full text-left">
            <tbody>
              {macro.map((m) => (
                <tr key={m.symbol} className="border-b border-truffle-400/8 last:border-0">
                  <td className="py-2 font-mono text-[0.72rem] text-bone/65">{m.label}</td>
                  <td className="py-2 text-right font-mono text-[0.72rem] text-bone">{price(m.price)}</td>
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
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/50">
          Mega-cap movers
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {moversSorted.map((m) => (
            <a
              key={m.symbol}
              href={`/company/${m.symbol}`}
              className="rounded-xl border border-truffle-400/12 bg-soil-900/40 px-4 py-3 transition-colors hover:border-truffle-400/40"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[0.78rem] font-semibold text-bone">{m.symbol}</span>
                <span className={`font-mono text-[0.72rem] ${(m.changePct ?? 0) >= 0 ? "text-jade" : "text-blood"}`}>
                  {pct(m.changePct)}
                </span>
              </div>
              <p className="mt-1 font-mono text-[0.72rem] text-bone/55">{price(m.price)}</p>
              <p className="mt-0.5 truncate font-mono text-[0.58rem] text-bone/35">{m.name ?? ""}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
