import Link from "next/link";
import {
  forecastAudit,
  latestRunForTicker,
  watchlistTickers,
} from "@core/research/store";
import { yahooChart } from "@core/research/providers";
import StanceBadge from "@/components/research/StanceBadge";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const items = watchlistTickers();
  const rows = await Promise.all(
    items.map(async (w) => {
      let price: number | null = null;
      let changePct: number | null = null;
      try {
        const { quote } = await yahooChart(w.ticker, "5d", "1d");
        price = quote.price;
        changePct = quote.changePct;
      } catch {
        // DATA UNAVAILABLE
      }
      const run = latestRunForTicker(w.ticker);
      return { ...w, price, changePct, run };
    }),
  );
  const audit = forecastAudit();

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-16 pt-4 sm:px-8">
      <div className="tt-pageband">
        <div>
          <p className="tt-eyebrow">Watchlist & audit</p>
          <h1 style={{ margin: 0 }}>
            <span className="tt-page-title">What the pit believes</span>
          </h1>
        </div>
      </div>

      <section className="card mt-5 overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-6 font-mono text-[0.75rem] text-faint">
            Watchlist empty. Open any{" "}
            <Link href="/markets" className="gold-underline text-truffle-300">
              company dossier
            </Link>{" "}
            and hit ☆ Watch.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-soil-600 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-faint">
                <th className="px-5 py-3">Ticker</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Day</th>
                <th className="px-5 py-3">Latest thesis</th>
                <th className="px-5 py-3">Confidence</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ticker} className="border-b border-soil-600 last:border-0 hover:bg-soil-800/30">
                  <td className="px-5 py-3">
                    <Link href={`/company/${r.ticker}`} className="gold-underline font-mono text-[0.82rem] text-ink">
                      {r.ticker}
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-mono text-[0.75rem] text-ink">
                    {r.price == null ? "—" : r.price.toFixed(2)}
                  </td>
                  <td className={`px-5 py-3 font-mono text-[0.72rem] ${(r.changePct ?? 0) >= 0 ? "text-jade" : "text-blood"}`}>
                    {r.changePct == null ? "—" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
                  </td>
                  <td className="px-5 py-3">
                    {r.run ? (
                      <div className="flex items-center gap-2">
                        <StanceBadge stance={r.run.consensus.stance} />
                        <Link href={`/research/${r.run.id}`} className="font-mono text-[0.62rem] text-truffle-300">
                          #{r.run.id}
                        </Link>
                      </div>
                    ) : (
                      <span className="font-mono text-[0.68rem] text-faint">no runs</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-[0.68rem] uppercase text-bone-soft">
                    {r.run ? r.run.thesis.confidence.level : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/research?ticker=${r.ticker}&autorun=1`}
                      className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint hover:text-truffle-300"
                    >
                      re-run →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Forecast audit — no cherry-picking (§22) */}
      <section className="card mt-5 p-6">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">
          Forecast audit — every forecast counted
        </h2>
        {audit.resolved === 0 ? (
          <p className="mt-3 font-mono text-[0.72rem] leading-relaxed text-faint">
            No resolved forecasts yet. Forecasts (90-day direction) are recorded with each run and resolved
            automatically against live prices — hits and misses both stay on the record.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-soil-600 bg-soil-950 p-4">
              <p className="font-mono text-[0.56rem] uppercase tracking-[0.2em] text-faint">Directional accuracy</p>
              <p className="font-display mt-1 text-[1.6rem] font-semibold text-ink">
                {audit.directionalAccuracy == null ? "—" : `${Math.round(audit.directionalAccuracy * 100)}%`}
              </p>
            </div>
            {[
              ["Resolved", String(audit.resolved)],
              ["Pending", String(audit.pending)],
              ["Total", String(audit.total)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-soil-600 bg-soil-950 p-4">
                <p className="font-mono text-[0.56rem] uppercase tracking-[0.2em] text-faint">{k}</p>
                <p className="font-display mt-1 text-[1.6rem] font-semibold text-ink">{v}</p>
              </div>
            ))}
          </div>
        )}
        {audit.byTicker.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {audit.byTicker.map((t) => (
              <li key={t.ticker} className="flex items-center justify-between font-mono text-[0.7rem] text-bone-soft">
                <span>{t.ticker}</span>
                <span>
                  {t.correct}/{t.resolved} correct
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
