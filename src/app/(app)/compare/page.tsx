import Link from "next/link";
import { buildDataPack } from "@core/research/datapack";

export const dynamic = "force-dynamic";

interface Row {
  label: string;
  get: (pack: Awaited<ReturnType<typeof buildDataPack>>) => string | null;
  higherBetter: boolean | null;
}

const ROWS: Row[] = [
  { label: "Price", get: (p) => (p.quote.price == null ? null : p.quote.price.toFixed(2)), higherBetter: null },
  { label: "Day change %", get: (p) => (p.quote.changePct == null ? null : p.quote.changePct.toFixed(2)), higherBetter: true },
  { label: "Market cap", get: (p) => (p.quote.marketCap == null ? null : bigNum(p.quote.marketCap)), higherBetter: null },
  { label: "P/E (TTM)", get: (p) => (p.fundamentals?.peTtm == null ? null : p.fundamentals.peTtm.toFixed(1)), higherBetter: false },
  { label: "Forward P/E", get: (p) => (p.fundamentals?.forwardPe == null ? null : p.fundamentals.forwardPe.toFixed(1)), higherBetter: false },
  { label: "Gross margin %", get: (p) => (p.fundamentals?.grossMarginPct == null ? null : p.fundamentals.grossMarginPct.toFixed(1)), higherBetter: true },
  { label: "Operating margin %", get: (p) => (p.fundamentals?.operatingMarginPct == null ? null : p.fundamentals.operatingMarginPct.toFixed(1)), higherBetter: true },
  { label: "Revenue growth YoY %", get: (p) => (p.fundamentals?.revenueGrowthYoYPct == null ? null : p.fundamentals.revenueGrowthYoYPct.toFixed(1)), higherBetter: true },
  { label: "RSI-14", get: (p) => (p.technicals.rsi14 == null ? null : p.technicals.rsi14.toFixed(1)), higherBetter: null },
  { label: "Trend regime", get: (p) => p.technicals.trendRegime ?? null, higherBetter: null },
  { label: "Rel strength vs SPY %", get: (p) => (p.technicals.relStrengthVsSpy30d == null ? null : p.technicals.relStrengthVsSpy30d.toFixed(1)), higherBetter: true },
  { label: "Latest thesis", get: (p) => null, higherBetter: null },
];

function bigNum(n: number): string {
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const params = await searchParams;
  const tickers = (params.t ?? "")
    .split(/\s+vs\s+|[\s,+]+/i)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[A-Z^.\-=]{1,10}$/.test(t))
    .slice(0, 4);

  const packs = await Promise.all(
    tickers.map(async (t) => {
      try {
        return await buildDataPack(t);
      } catch {
        return null;
      }
    }),
  );
  const valid = packs.filter((p): p is NonNullable<typeof p> => p != null && p.quote.price != null);

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-10 sm:px-8">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/75">
        Comparison engine
      </span>
      <h1 className="font-display mt-2 text-[clamp(1.9rem,4vw,3rem)] font-semibold text-ink">Compare</h1>
      <p className="mt-3 max-w-2xl text-[0.9rem] leading-relaxed text-bone-soft">
        Structured side-by-side comparison — not prose. Append{" "}
        <code className="font-mono text-truffle-300">?t=NVDA vs AMD</code> to the URL, or use Ctrl+K → Compare.
      </p>

      {valid.length < 2 ? (
        <p className="card mt-8 p-6 font-mono text-[0.75rem] text-bone-soft">
          Enter at least two valid tickers to compare (e.g.{" "}
          <Link href="/compare?t=NVDA vs AMD" className="gold-underline text-truffle-300">
            NVDA vs AMD
          </Link>
          ).
        </p>
      ) : (
        <section className="card mt-8 overflow-x-auto p-0">
          <table className="w-full min-w-[600px] text-left">
            <thead>
              <tr className="border-b border-soil-600">
                <th className="px-5 py-4 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-faint">Metric</th>
                {valid.map((p) => (
                  <th key={p.ticker} className="px-5 py-4">
                    <Link href={`/company/${p.ticker}`} className="gold-underline font-display text-[1.1rem] font-semibold text-ink">
                      {p.ticker}
                    </Link>
                    <p className="font-mono text-[0.56rem] uppercase tracking-[0.16em] text-faint">
                      {p.quote.name ?? ""}
                    </p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b border-soil-600 last:border-0">
                  <td className="px-5 py-3 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-faint">
                    {row.label}
                  </td>
                  {valid.map((p) => {
                    const v = row.get(p);
                    return (
                      <td key={p.ticker} className="px-5 py-3 font-mono text-[0.78rem] text-bone-soft">
                        {v ?? <span className="text-faint">DATA UNAVAILABLE</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
