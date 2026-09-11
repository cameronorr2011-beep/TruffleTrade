"use client";

import { useState } from "react";
import Link from "next/link";
import CandleChart from "@/components/market/CandleChart";

type Quote = {
  ticker: string;
  name: string | null;
  price: number | null;
  changePct: number | null;
  prevClose?: number | null;
};

type NavItem = { href: string; label: string; icon: string; active?: boolean; badge?: string };

const SIDE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "▦", active: true },
  { href: "/markets", label: "Markets", icon: "◍" },
  { href: "/desk", label: "Council desk", icon: "✦", badge: "6+1" },
  { href: "/watchlist", label: "Watchlist", icon: "★" },
  { href: "/compare", label: "Compare", icon: "⇄" },
];

const TOOLS: NavItem[] = [
  { href: "/research", label: "Research history", icon: "⧗" },
  { href: "/blog", label: "Field notes", icon: "✉" },
  { href: "/buy", label: "Subscription", icon: "◇" },
];

const INDEX_LABELS: Record<string, string> = {
  "^GSPC": "S&P 500",
  "^IXIC": "NASDAQ",
  "^DJI": "Dow Jones",
  "^VIX": "Volatility",
};

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function Pct({ value }: { value: number | null | undefined }) {
  if (value == null || Number.isNaN(value)) return <span className="text-faint">—</span>;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${up ? "positive" : "negative"}`}>
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export default function DashboardClient({
  indices,
  movers,
  macroCount,
  sectorNote,
}: {
  indices: { ticker: string; name: string; price: number | null; changePct: number | null }[];
  movers: Quote[];
  macroCount: number;
  sectorNote: string;
}) {
  const [chartTicker, setChartTicker] = useState("NVDA");
  const activeMover = movers.find((m) => m.ticker === chartTicker);
  const gainers = [...movers].filter((m) => m.changePct != null).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));

  return (
    <div className="flex min-h-[calc(100vh-57px)]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[224px] flex-col overflow-y-auto border-r border-soil-600 bg-soil-950 px-4 pb-5 pt-[76px] lg:flex">
        <p className="px-3 pb-2.5 text-[9px] font-bold uppercase tracking-[1.3px] text-faint">Workspace</p>
        <nav className="flex flex-col gap-1">
          {SIDE_NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex min-h-[38px] items-center gap-2.5 rounded-lg px-3 text-[12px] ${
                n.active ? "bg-truffle-200/70 font-bold text-truffle-600" : "text-bone-soft hover:bg-soil-700 hover:text-ink"
              }`}
            >
              <span aria-hidden className="w-4 text-center text-[13px]">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {n.badge && <span className="rounded border border-soil-500 bg-white px-1.5 py-0.5 text-[9px] text-bone-soft">{n.badge}</span>}
            </Link>
          ))}
        </nav>
        <p className="mt-7 px-3 pb-2.5 text-[9px] font-bold uppercase tracking-[1.3px] text-faint">Tools</p>
        <nav className="flex flex-col gap-1">
          {TOOLS.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex min-h-[38px] items-center gap-2.5 rounded-lg px-3 text-[12px] text-bone-soft hover:bg-soil-700 hover:text-ink"
            >
              <span aria-hidden className="w-4 text-center text-[13px]">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-10">
          <div className="relative isolate overflow-hidden rounded-xl bg-forest p-4 text-white" style={{ background: "#234e37" }}>
            <div aria-hidden className="absolute -right-14 -top-16 h-40 w-40 rounded-full border border-white/10" />
            <div aria-hidden className="absolute -right-8 -top-10 h-28 w-28 rounded-full border border-white/10" />
            <p className="relative text-[9px] font-bold uppercase tracking-[1.2px] text-mint/80">The council</p>
            <p className="relative mt-2 text-[15px] font-semibold leading-snug">Six analysts. One verdict you can argue with.</p>
            <Link
              href="/desk"
              className="relative mt-4 flex items-center justify-between rounded-md bg-mint px-3 py-2 text-[10px] font-bold text-forest"
            >
              Run an analysis <span aria-hidden>→</span>
            </Link>
          </div>
          <p className="mt-4 flex items-center gap-2 px-2 text-[9px] text-faint">
            <span className="live-dot" style={{ width: 5, height: 5 }} /> live data · keyless yahoo
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1 lg:ml-[224px]">
        <div className="mx-auto max-w-[1220px] px-5 pb-16 pt-7 sm:px-8">
          {/* Heading */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-faint">Your daily advantage</p>
              <h1 className="mt-1.5 text-[28px] font-bold tracking-[-1.2px] text-ink">Less noise. More signal.</h1>
              <p className="mt-1 text-[12px] text-bone-soft">
                Live candles, real quotes, and the council — one quiet workspace.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/desk" className="btn-primary">Run analysis</Link>
              <Link href="/buy" className="btn-secondary">Get access</Link>
            </div>
          </div>

          {/* Index cards */}
          <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
            {indices.map((idx) => (
              <article key={idx.ticker} className="card relative min-h-[104px] overflow-hidden p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded border border-soil-600 bg-soil-700 text-[10px] text-bone-soft">
                    {INDEX_LABELS[idx.ticker]?.[0] ?? idx.ticker.replace("^", "")[0]}
                  </span>
                  <h2 className="text-[11px] font-bold text-bone-soft">{INDEX_LABELS[idx.ticker] ?? idx.ticker}</h2>
                  <span className="ml-auto text-[8px] uppercase tracking-[0.6px] text-faint">{idx.ticker}</span>
                </div>
                <p className="mt-2 text-[21px] font-bold tracking-[-0.8px] text-ink">{fmt(idx.price)}</p>
                <div className="mt-0.5">
                  <Pct value={idx.changePct} />
                </div>
              </article>
            ))}
          </div>

          {/* Chart + council promo */}
          <div className="mt-5 grid items-stretch gap-5 xl:grid-cols-[minmax(0,2.2fr)_minmax(280px,1fr)]">
            <CandleChart ticker={chartTicker} title={`${chartTicker} — live market candles`} />

            <aside className="card relative isolate overflow-hidden bg-mint">
              <div aria-hidden className="absolute -right-10 -top-12 h-44 w-44 rounded-full border border-forest/10" />
              <div aria-hidden className="absolute -right-2 top-10 h-28 w-28 rounded-full border border-forest/10" />
              <div className="relative p-6 pt-24">
                <p className="text-[9px] font-bold uppercase tracking-[1.2px] text-forest/70">Ai council · 6+1</p>
                <h2 className="mt-2 text-[24px] font-bold leading-tight tracking-[-1px] text-forest">
                  Conviction, not consensus.
                </h2>
                <p className="mt-2.5 text-[11px] leading-relaxed text-bone-soft">
                  Six rival analysts investigate the same chart. A fact-checker verifies every claim. A red team is paid
                  to say no.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  {["F", "V", "T", "M", "C", "N"].map((l, i) => (
                    <span
                      key={l + i}
                      className="grid h-6 w-6 place-items-center rounded-full border-2 border-mint text-[9px] font-bold"
                      style={{ background: ["#dce5cf", "#e6dfd1", "#dcdfdf", "#e3dccf", "#d8e4e8", "#e8e0d2"][i], color: "#4c6457" }}
                    >
                      {l}
                    </span>
                  ))}
                </div>
                <Link href="/desk" className="btn-primary mt-4 w-full justify-between">
                  Open the desk <span aria-hidden>→</span>
                </Link>
                <p className="mt-2.5 text-[10px] text-faint">
                  Included with your 1,000-sat subscription · analysis only, never auto-trading
                </p>
              </div>
            </aside>
          </div>

          {/* Movers table */}
          <section className="card mt-5 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 pb-3.5 pt-4">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-bold text-ink">Today&apos;s movers</h2>
                <span className="live-dot" style={{ width: 5, height: 5 }} />
              </div>
              <Link href="/markets" className="text-[11px] font-semibold text-forest hover:text-truffle-600">
                All markets →
              </Link>
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
                  {gainers.map((m) => (
                    <tr key={m.ticker} className="border-b border-soil-600/70 last:border-0 hover:bg-soil-950/50">
                      <td className="px-5 py-3">
                        <button onClick={() => setChartTicker(m.ticker)} className="text-left">
                          <span className="block font-bold text-ink">{m.ticker}</span>
                          <span className="block max-w-[200px] truncate text-[10px] text-faint">{m.name ?? "—"}</span>
                        </button>
                      </td>
                      <td className="px-3 py-3 font-semibold text-ink">{fmt(m.price)}</td>
                      <td className="px-3 py-3">
                        <Pct value={m.changePct} />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => setChartTicker(m.ticker)}
                          className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                            chartTicker === m.ticker
                              ? "border-truffle-400 bg-truffle-200/70 text-truffle-600"
                              : "border-soil-500 text-bone-soft hover:bg-soil-700"
                          }`}
                        >
                          {chartTicker === m.ticker ? "showing" : "view"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-soil-600 px-5 py-3 text-[10px] text-faint">
              <span className="flex items-center gap-1.5">
                <span className="live-dot" style={{ width: 4, height: 4 }} /> Live quotes · {macroCount} macro series · {sectorNote.toLowerCase()}
              </span>
              <span>Prices delayed up to 15 min (Yahoo)</span>
            </div>
          </section>

          {/* Mobile nav (sidebar hidden on small screens) */}
          <nav className="mt-6 flex flex-wrap gap-2 lg:hidden">
            {[...SIDE_NAV, ...TOOLS].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${
                  n.active ? "border-truffle-400 bg-truffle-200/70 text-truffle-600" : "border-soil-500 bg-white text-bone-soft"
                }`}
              >
                {n.icon} {n.label}
              </Link>
            ))}
          </nav>

          <p className="mt-8 text-[11px] leading-relaxed text-faint">
            Dashboard data is live but delayed; it is for research only and is not investment advice. Council analysis
            requires an active access code —{" "}
            <Link href="/buy" className="font-semibold text-forest hover:text-truffle-600">
              get access
            </Link>
            {activeMover?.price == null ? " · some quotes are still loading" : ""}.
          </p>
        </div>
      </div>
    </div>
  );
}
