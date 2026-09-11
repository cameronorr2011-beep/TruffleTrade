import Link from "next/link";
import { notFound } from "next/navigation";
import { buildDataPack } from "@core/research/datapack";
import { thesisHistory, latestRunForTicker } from "@core/research/store";
import StanceBadge from "@/components/research/StanceBadge";
import WatchButton from "@/components/research/WatchButton";

export const dynamic = "force-dynamic";

function fmt(n: number | null, d = 2, suffix = ""): string {
  if (n == null || !Number.isFinite(n)) return "DATA UNAVAILABLE";
  return n.toLocaleString("en-US", { maximumFractionDigits: d }) + suffix;
}

function bigUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "DATA UNAVAILABLE";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}

const STANCE_COLOR: Record<string, string> = {
  bullish: "text-jade",
  bearish: "text-blood",
  caution: "text-gold",
  neutral: "text-bone/70",
  "insufficient-evidence": "text-bone/45",
};

export default async function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw).toUpperCase();
  if (!/^[A-Z^.\-=]{1,10}$/.test(ticker)) notFound();

  const pack = await buildDataPack(ticker);
  if (pack.quote.price == null && pack.candles1d.length === 0) notFound();

  const history = thesisHistory(ticker, 20);
  const lastRun = latestRunForTicker(ticker);
  const q = pack.quote;
  const t = pack.technicals;
  const f = pack.fundamentals;

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-10 sm:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/75">
            Company dossier
          </span>
          <h1 className="font-display mt-2 text-[clamp(2.2rem,5vw,3.8rem)] font-semibold text-bone">
            {q.ticker}
          </h1>
          <p className="font-mono text-[0.7rem] text-bone/50">
            {q.name ?? "DATA UNAVAILABLE"} · {q.exchange ?? "exchange unknown"} · {q.currency}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-[2.4rem] font-semibold text-bone">{fmt(q.price)}</p>
          <p className={`font-mono text-[0.78rem] ${(q.changePct ?? 0) >= 0 ? "text-jade" : "text-blood"}`}>
            {q.changePct == null ? "—" : `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%`} prev close{" "}
            {fmt(q.prevClose)}
          </p>
          <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-bone/35">
            Data as of {q.asOf ? new Date(q.asOf).toLocaleString("en-US") : "unknown"} · {q.source}
          </p>
        </div>
      </div>

      {/* Latest thesis snapshot */}
      {lastRun && (
        <section className="card mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <StanceBadge stance={lastRun.consensus.stance} />
            <span className="font-mono text-[0.68rem] text-bone/55">
              run #{lastRun.id} · score {lastRun.consensus.score >= 0 ? "+" : ""}
              {lastRun.consensus.score.toFixed(2)} · confidence {lastRun.thesis.confidence.level}
            </span>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/research/${lastRun.id}`}
              className="rounded-full border border-truffle-400/40 px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-truffle-200 hover:bg-truffle-500/15"
            >
              Open dossier
            </Link>
            <Link
              href={`/research?ticker=${ticker}&autorun=1`}
              className="rounded-full bg-truffle-500 px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-void hover:bg-truffle-400"
            >
              Re-run investigation
            </Link>
          </div>
        </section>
      )}

      {/* Market data grid */}
      <section className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {[
          ["Market cap", bigUsd(q.marketCap)],
          ["52w range", q.fiftyTwoWeekLow != null && q.fiftyTwoWeekHigh != null ? `${fmt(q.fiftyTwoWeekLow)} – ${fmt(q.fiftyTwoWeekHigh)}` : "DATA UNAVAILABLE"],
          ["RSI-14", t.rsi14 == null ? "DATA UNAVAILABLE" : t.rsi14.toFixed(1)],
          ["Trend regime", t.trendRegime ?? "DATA UNAVAILABLE"],
          ["SMA 20/50/200", t.sma200 != null ? `${fmt(t.sma20, 0)} / ${fmt(t.sma50, 0)} / ${fmt(t.sma200, 0)}` : t.sma50 != null ? `${fmt(t.sma20, 0)} / ${fmt(t.sma50, 0)} / —` : "DATA UNAVAILABLE"],
          ["ATR %", t.atrPct == null ? "DATA UNAVAILABLE" : `${t.atrPct.toFixed(2)}%`],
          ["Real vol 20d (ann.)", t.realizedVol20Pct == null ? "DATA UNAVAILABLE" : `${t.realizedVol20Pct.toFixed(1)}%`],
          ["Rel strength vs SPY", t.relStrengthVsSpy30d == null ? "DATA UNAVAILABLE" : `${t.relStrengthVsSpy30d >= 0 ? "+" : ""}${t.relStrengthVsSpy30d.toFixed(2)}%`],
          ["P/E (TTM)", f?.peTtm == null ? "DATA UNAVAILABLE" : f.peTtm.toFixed(1)],
          ["Forward P/E", f?.forwardPe == null ? "DATA UNAVAILABLE" : f.forwardPe.toFixed(1)],
          ["Gross margin", f?.grossMarginPct == null ? "DATA UNAVAILABLE" : `${f.grossMarginPct.toFixed(1)}%`],
          ["Revenue growth YoY", f?.revenueGrowthYoYPct == null ? "DATA UNAVAILABLE" : `${f.revenueGrowthYoYPct >= 0 ? "+" : ""}${f.revenueGrowthYoYPct.toFixed(1)}%`],
        ].map(([k, v]) => (
          <div key={k} className="card px-5 py-4">
            <p className="font-mono text-[0.56rem] uppercase tracking-[0.2em] text-bone/40">{k}</p>
            <p className={`mt-1.5 font-mono text-[0.92rem] ${v === "DATA UNAVAILABLE" ? "text-bone/30" : "text-bone"}`}>
              {v}
            </p>
          </div>
        ))}
      </section>

      {/* News + thesis history */}
      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/50">
            Recent headlines (untrusted input, provenance tracked)
          </h2>
          {pack.news.length === 0 ? (
            <p className="mt-3 font-mono text-[0.72rem] text-bone/45">DATA UNAVAILABLE.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {pack.news.slice(0, 8).map((n, i) => (
                <li key={i} className="border-b border-truffle-400/8 pb-3 last:border-0 last:pb-0">
                  <a href={n.link} target="_blank" rel="noreferrer nofollow" className="text-[0.84rem] leading-snug text-bone/75 hover:text-bone">
                    {n.title}
                  </a>
                  <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.16em] text-bone/35">
                    {n.source}
                    {n.publishedTs ? ` · ${new Date(n.publishedTs).toLocaleDateString("en-US")}` : " · date unknown"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/50">Thesis history</h2>
            <WatchButton ticker={ticker} />
          </div>
          {history.length === 0 ? (
            <p className="mt-3 font-mono text-[0.72rem] text-bone/45">
              No theses yet. Run an investigation to start the audit trail.
            </p>
          ) : (
            <ol className="mt-4 space-y-3 border-l border-truffle-400/20 pl-4">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-truffle-400" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-mono text-[0.7rem] uppercase tracking-[0.14em] ${STANCE_COLOR[h.stance] ?? "text-bone/60"}`}>
                      {h.stance}
                    </span>
                    <span className="font-mono text-[0.6rem] text-bone/35">
                      {new Date(h.ts).toLocaleDateString("en-US")} ·{" "}
                      <Link href={`/research/${h.runId}`} className="gold-underline text-truffle-300">
                        run #{h.runId}
                      </Link>
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[0.78rem] leading-relaxed text-bone/55">{h.summary}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <p className="mt-6 font-mono text-[0.6rem] uppercase tracking-[0.24em] text-bone/30">
        sources: {pack.sources.join(" · ") || "none"} · retrieved {new Date(pack.retrievalTs).toLocaleTimeString("en-US")}
      </p>
    </div>
  );
}
