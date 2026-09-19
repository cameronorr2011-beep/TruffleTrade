"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number | null };

type ApiPayload = {
  ok: boolean;
  candles?: Candle[];
  prevClose?: number | null;
  currency?: string | null;
  name?: string | null;
  exchange?: string | null;
  error?: string;
};

const RANGES = ["1D", "1W", "1M", "6M", "1Y", "5Y"] as const;
type Range = (typeof RANGES)[number];

const REFRESH_MS: Record<Range, number> = {
  "1D": 60_000,
  "1W": 120_000,
  "1M": 300_000,
  "6M": 600_000,
  "1Y": 600_000,
  "5Y": 900_000,
};

function fmtPrice(n: number, currency: string | null) {
  const cur = currency === "USD" || currency == null ? "USD" : currency;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

function fmtVol(v: number | null) {
  if (v == null) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

function xLabel(t: number, range: Range) {
  const d = new Date(t);
  switch (range) {
    case "1D":
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    case "1W":
      return d.toLocaleDateString("en-US", { weekday: "short" });
    case "1M":
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "6M":
      return d.toLocaleDateString("en-US", { month: "short" });
    case "1Y":
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    case "5Y":
      return d.toLocaleDateString("en-US", { year: "numeric" });
  }
}

export default function CandleChart({
  ticker,
  compact = false,
  title,
  onSelectTicker,
}: {
  ticker: string;
  compact?: boolean;
  title?: string;
  onSelectTicker?: (t: string) => void;
}) {
  const [range, setRange] = useState<Range>("1M");
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const gradientId = useId().replace(/:/g, "");

  const load = useCallback(
    async (showSpinner: boolean) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      if (showSpinner) setLoading(true);
      try {
        const res = await fetch(`/api/candles/${encodeURIComponent(ticker)}?range=${range}`, {
          signal: ac.signal,
        });
        const j = (await res.json()) as ApiPayload;
        if (!j.ok) throw new Error(j.error ?? "unavailable");
        setData(j);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    },
    [ticker, range],
  );

  useEffect(() => {
    setHover(null);
    load(true);
    const iv = setInterval(() => load(false), REFRESH_MS[range]);
    return () => {
      clearInterval(iv);
      abortRef.current?.abort();
    };
  }, [load, range]);

  const candles = useMemo(() => (data?.candles ?? []).filter((c) => c.c != null), [data]);

  // Chart geometry
  const width = 760;
  const height = compact ? 150 : 260;
  const plotW = width - 62;
  const min = candles.length ? Math.min(...candles.map((c) => c.l)) * 0.998 : 0;
  const max = candles.length ? Math.max(...candles.map((c) => c.h)) * 1.002 : 1;
  const y = (v: number) => 10 + ((max - v) / (max - min || 1)) * (height - 34);
  const band = plotW / Math.max(candles.length, 1);
  const cw = Math.max(Math.min(band * 0.62, 14), 1.2);
  const cx = (i: number) => i * band + band / 2;
  const last = candles[candles.length - 1];
  const first = candles[0];
  const ref = candles.length > 1 ? candles[candles.length - 2].c : data?.prevClose ?? first?.c;
  const change = last && ref != null ? last.c - ref : 0;
  const changePct = last && ref ? (change / ref) * 100 : 0;
  const up = change >= 0;
  // Chart chrome reads site-scoped CSS variables (set on .tt-site in
  // globals.css) and falls back to the original values everywhere else, so
  // the paid app's charts render exactly as before.
  const upColor = "var(--chart-up, #408260)";
  const downColor = "var(--chart-down, #b3543f)";
  const lastColor = last ? (last.c >= (first?.c ?? last.c) ? upColor : downColor) : upColor;
  const current = hover != null ? candles[hover] : last;

  const gridVals = useMemo(() => [0, 1, 2, 3, 4].map((i) => min + ((max - min) * i) / 4), [min, max]);

  const xLabels = useMemo(() => {
    if (candles.length < 2) return [];
    const n = compact ? 4 : 6;
    const step = Math.max(1, Math.floor((candles.length - 1) / n));
    const out: { i: number; label: string }[] = [];
    for (let i = 0; i < candles.length; i += step) out.push({ i, label: xLabel(candles[i].t, range) });
    return out;
  }, [candles, range, compact]);

  return (
    <section className="card flex min-w-0 flex-col" aria-label={`${ticker} live candlestick chart`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="live-dot" />
          <h2 className="truncate text-[13px] font-bold tracking-[-0.2px] text-ink">{title ?? `${ticker} · Live candles`}</h2>
          {data?.exchange && <span className="hidden text-[10px] text-faint sm:inline">· {data.exchange}</span>}
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-soil-600 bg-soil-950 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              aria-pressed={r === range}
              onClick={() => setRange(r)}
              className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                r === range ? "bg-truffle-200 text-truffle-600" : "text-bone-soft hover:bg-soil-700 hover:text-ink"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 px-5 pt-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] text-bone-soft">
            {data?.name ?? ticker}
            {data?.currency && <span className="ml-1.5 text-faint">· {data.currency}</span>}
          </div>
          <div className="mt-0.5 flex items-baseline gap-2.5">
            <strong className="text-[28px] font-bold leading-tight tracking-[-1px] text-ink">
              {current ? fmtPrice(current.c, data?.currency ?? null) : loading ? "…" : "—"}
            </strong>
            {current && ref != null && (
              <span className={`flex items-center gap-1 text-[11px] font-semibold ${up ? "positive" : "negative"}`}>
                {up ? "▲" : "▼"} {change >= 0 ? "+" : ""}
                {change.toFixed(2)} ({changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%)
              </span>
            )}
          </div>
        </div>
        {current && (
          <div className="hidden shrink-0 gap-4 text-right text-[10px] text-faint sm:flex">
            <span>
              O <b className="font-semibold text-bone-soft">{fmtPrice(current.o, data?.currency ?? null)}</b>
            </span>
            <span>
              H <b className="font-semibold text-bone-soft">{fmtPrice(current.h, data?.currency ?? null)}</b>
            </span>
            <span>
              L <b className="font-semibold text-bone-soft">{fmtPrice(current.l, data?.currency ?? null)}</b>
            </span>
            <span>
              Vol <b className="font-semibold text-bone-soft">{fmtVol(current.v)}</b>
            </span>
          </div>
        )}
      </div>

      <div
        className="relative mx-2 mt-2 cursor-crosshair select-none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          if (!candles.length) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - rect.left) / rect.width) * plotW;
          const i = Math.max(0, Math.min(candles.length - 1, Math.floor(rel / band)));
          setHover(i);
        }}
      >
        {loading && candles.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-[12px] text-faint">Loading live candles…</div>
        ) : error && candles.length === 0 ? (
          <div className="flex h-[180px] flex-col items-center justify-center gap-1 text-[12px] text-faint">
            <span>Live candles unavailable for {ticker}.</span>
            <span className="text-[10px]">{error}</span>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Live ${range} candlestick chart for ${ticker}`}
            className="w-full overflow-visible"
          >
            <defs>
              <linearGradient id={`cg-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lastColor} stopOpacity="0.16" />
                <stop offset="100%" stopColor={lastColor} stopOpacity="0.01" />
              </linearGradient>
            </defs>
            {gridVals.map((v, i) => (
              <g key={i}>
                <line x1="0" x2={plotW} y1={y(v)} y2={y(v)} stroke="var(--chart-grid, #e9ede8)" strokeDasharray="3 4" />
                <text x={width - 4} y={y(v) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--chart-label, #a7ae9b)">
                  {fmtPrice(v, data?.currency ?? null)}
                </text>
              </g>
            ))}
            {/* close-path area for readability under candles */}
            <path
              d={`${candles.map((c, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${y(c.c).toFixed(1)}`).join(" ")} L${cx(candles.length - 1).toFixed(1)},${height - 20} L${cx(0).toFixed(1)},${height - 20} Z`}
              fill={`url(#cg-${gradientId})`}
              stroke="none"
            />
            {candles.map((c, i) => {
              const col = c.c >= c.o ? upColor : downColor;
              const bodyTop = y(Math.max(c.o, c.c));
              const bodyBot = y(Math.min(c.o, c.c));
              return (
                <g key={c.t} opacity={hover == null || hover === i ? 1 : 0.85}>
                  <line x1={cx(i)} x2={cx(i)} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={Math.max(cw * 0.14, 0.8)} />
                  {bodyBot - bodyTop < 1 ? (
                    <rect x={cx(i) - cw / 2} y={bodyTop - 0.5} width={cw} height={1.4} fill={col} />
                  ) : (
                    <rect x={cx(i) - cw / 2} y={bodyTop} width={cw} height={bodyBot - bodyTop} fill={col} rx={cw > 4 ? 1 : 0} />
                  )}
                </g>
              );
            })}
            {last && (
              <>
                <line x1={plotW} x2={plotW + 4} y1={y(last.c)} y2={y(last.c)} stroke={lastColor} />
                <rect x={plotW + 6} y={y(last.c) - 9} width="52" height="18" rx="4" fill="var(--chart-badge, #eaf1e5)" stroke="var(--chart-badge-line, #dbe7d6)" />
                <text x={plotW + 32} y={y(last.c) + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={lastColor}>
                  {last.c.toFixed(2)}
                </text>
              </>
            )}
            {hover != null && candles[hover] && (
              <>
                <line x1={cx(hover)} x2={cx(hover)} y1="0" y2={height - 20} stroke="var(--chart-crosshair, #86a891)" strokeDasharray="4 4" />
                <circle cx={cx(hover)} cy={y(candles[hover].c)} r="4.5" fill="var(--chart-dot, #fff)" stroke={upColor} strokeWidth="2" />
              </>
            )}
            <line x1="0" x2={plotW} y1={height - 19.5} y2={height - 19.5} stroke="var(--chart-axis, #e7eae4)" />
          </svg>
        )}
        {hover != null && candles[hover] && (
          <div
            className="candle-tooltip"
            style={{
              left: `${Math.min(88, Math.max(10, (cx(hover) / width) * 100))}%`,
              top: 6,
            }}
          >
            <span>{new Date(candles[hover].t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            <strong>{fmtPrice(candles[hover].c, data?.currency ?? null)}</strong>
          </div>
        )}
      </div>

      <div className="flex justify-between px-5 pb-1 pt-2 text-[10px] text-bone-soft">
        {xLabels.map((l) => (
          <span key={l.i}>{l.label}</span>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-soil-600 px-5 py-3 text-[10px] text-faint">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-1 w-1 rounded-full bg-jade" /> Live · Yahoo Finance · auto-refreshes
        </span>
        <span>OHLC candles</span>
      </div>
    </section>
  );
}
