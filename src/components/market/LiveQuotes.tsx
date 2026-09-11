"use client";

import { useEffect, useState } from "react";
import CandleChart from "./CandleChart";
import NewsPanel from "./NewsPanel";

type Quote = { ticker: string; name: string | null; price: number | null; changePct: number | null };
type MarketsPayload = {
  ok: boolean;
  indices: { symbol: string; price: number | null; changePct: number | null }[];
  movers: Quote[];
};

const INDEX_LABELS: Record<string, string> = {
  "^GSPC": "S&P 500",
  "^IXIC": "NASDAQ",
  "^DJI": "Dow Jones",
  "^RUT": "Russell 2000",
};

const UP = "#408260";
const DOWN = "#b3543f";

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Wraps the SSR dashboard content with client-side live polling:
 *  - index cards + movers table refresh every 60s from /api/markets
 *  - a 24-point 1m-candle live sparkline renders inside each index card
 *  - selected ticker drives the big candle chart + news panel
 */
export default function LiveQuotes({
  initialIndices,
  initialMovers,
  initialTicker,
}: {
  initialIndices: { ticker: string; name: string; price: number | null; changePct: number | null }[];
  initialMovers: Quote[];
  initialTicker: string;
}) {
  const [indices, setIndices] = useState(initialIndices);
  const [movers, setMovers] = useState(initialMovers);
  const [ticker, setTicker] = useState(initialTicker);
  const [sparks, setSparks] = useState<Record<string, number[]>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Live refresh loop — 60s quotes + 1m sparkline data
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/markets");
        const j = (await res.json()) as MarketsPayload;
        if (!alive || !j.ok) return;
        setIndices(
          j.indices.slice(0, 4).map((i) => ({
            ticker: i.symbol,
            name: INDEX_LABELS[i.symbol] ?? i.symbol,
            price: i.price,
            changePct: i.changePct,
          })),
        );
        setMovers(j.movers);
        setUpdatedAt(new Date());
      } catch {
        // transient — next tick retries
      }
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  // 1-minute candles per index for the sparkline
  useEffect(() => {
    let alive = true;
    const load = async () => {
      for (const idx of indices) {
        try {
          const res = await fetch(`/api/candles/${encodeURIComponent(idx.ticker)}?range=1D`);
          const j = (await res.json()) as { ok?: boolean; candles?: { c: number }[] };
          if (!alive || !j.ok) continue;
          const closes = (j.candles ?? []).slice(-24).map((c) => c.c);
          if (closes.length >= 2) setSparks((s) => ({ ...s, [idx.ticker]: closes }));
        } catch {
          // skip
        }
      }
    };
    load();
    const iv = setInterval(load, 90_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [indices]);

  const pctColor = (v: number | null | undefined) =>
    v == null || Number.isNaN(v) ? "#90968f" : v >= 0 ? UP : DOWN;

  return (
    <>
      {/* Index cards — live values + sparklines */}
      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {indices.map((idx) => {
          const spark = sparks[idx.ticker];
          const up = (idx.changePct ?? 0) >= 0;
          return (
            <article key={idx.ticker} className="card relative min-h-[112px] overflow-hidden p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded border border-soil-600 bg-soil-700 text-[10px] text-bone-soft">
                  {(INDEX_LABELS[idx.ticker] ?? idx.ticker)[0]}
                </span>
                <h2 className="text-[11px] font-bold text-bone-soft">{INDEX_LABELS[idx.ticker] ?? idx.ticker}</h2>
                <span className="ml-auto text-[8px] uppercase tracking-[0.6px] text-faint">{idx.ticker}</span>
              </div>
              <p className="mt-2 text-[21px] font-bold tracking-[-0.8px] text-ink">{fmt(idx.price)}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-[11px] font-semibold" style={{ color: pctColor(idx.changePct) }}>
                  {up ? "▲" : "▼"} {idx.changePct != null ? `${idx.changePct >= 0 ? "+" : ""}${idx.changePct.toFixed(2)}%` : "—"}
                </span>
              </div>
              {spark && (
                <svg className="absolute right-3 bottom-3 opacity-90" width="86" height="30" viewBox="0 0 86 30" aria-hidden>
                  {(() => {
                    const min = Math.min(...spark);
                    const max = Math.max(...spark);
                    const pts = spark
                      .map((v, i) => `${(i / (spark.length - 1)) * 84 + 1},${28 - ((v - min) / (max - min || 1)) * 24}`)
                      .join(" ");
                    return (
                      <>
                        <polyline points={pts} fill="none" stroke={pctColor(idx.changePct)} strokeWidth="1.6" strokeLinejoin="round" />
                      </>
                    );
                  })()}
                </svg>
              )}
            </article>
          );
        })}
      </div>

      {/* Chart + news, driven by the selected ticker */}
      <div className="mt-5 grid items-stretch gap-5 xl:grid-cols-[minmax(0,2.2fr)_minmax(280px,1fr)]">
        <CandleChart ticker={ticker} title={`${ticker} — live market candles`} />
        <NewsPanel ticker={ticker} />
      </div>

      {/* Movers table */}
      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 pb-3.5 pt-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-bold text-ink">Today&apos;s movers</h2>
            <span aria-hidden className="live-dot" style={{ width: 5, height: 5 }} />
          </div>
          <span className="text-[10px] text-faint">
            {updatedAt ? `updated ${updatedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : "loading…"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-y border-soil-600 bg-soil-950/60 text-[10px] text-bone-soft">
                <th className="px-5 py-2.5 font-medium">Ticker</th>
                <th className="px-3 py-2.5 font-medium">Price</th>
                <th className="px-3 py-2.5 font-medium">Change</th>
                <th className="px-3 py-2.5 font-medium">Chart</th>
              </tr>
            </thead>
            <tbody>
              {movers.map((m) => (
                <tr key={m.ticker} className="border-b border-soil-600/70 last:border-0 hover:bg-soil-950/50">
                  <td className="px-5 py-3">
                    <button onClick={() => setTicker(m.ticker)} className="text-left">
                      <span className="block font-bold text-ink">{m.ticker}</span>
                      <span className="block max-w-[200px] truncate text-[10px] text-faint">{m.name ?? "—"}</span>
                    </button>
                  </td>
                  <td className="px-3 py-3 font-semibold text-ink">{fmt(m.price)}</td>
                  <td className="px-3 py-3">
                    <span className="text-[11px] font-semibold" style={{ color: pctColor(m.changePct) }}>
                      {m.changePct != null ? `${m.changePct >= 0 ? "+" : ""}${m.changePct.toFixed(2)}%` : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => setTicker(m.ticker)}
                      className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                        ticker === m.ticker
                          ? "border-truffle-400 bg-truffle-200/70 text-truffle-600"
                          : "border-soil-500 text-bone-soft hover:bg-soil-700"
                      }`}
                    >
                      {ticker === m.ticker ? "showing" : "view"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-soil-600 px-5 py-3 text-[10px] text-faint">
          <span className="flex items-center gap-1.5">
            <span className="live-dot" style={{ width: 4, height: 4 }} /> Live quotes · 60s refresh · keyless Yahoo
          </span>
          <span>Prices delayed up to 15 min — real-time where the exchange allows</span>
        </div>
      </section>
    </>
  );
}
