"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CandleChart from "@/components/market/CandleChart";
import Link from "next/link";

type SearchHit = { symbol: string; name: string; exchange: string | null; type: string | null };

type SimBand = { day: number; p10: number; p25: number; med: number; p75: number; p90: number };

type Sim = {
  ticker: string;
  lastPrice: number;
  days: number;
  paths: number;
  bands: SimBand[];
  meanReturnPct: number;
  p05Pct: number;
  p95Pct: number;
  upProbabilityPct: number;
  maxDrawdownPct: number;
  sourceCandles: number;
  sigmaDailyPct: number;
  label: "MODEL OUTPUT";
  caveat: string;
};

const HORIZONS = [
  { days: 10, label: "10D" },
  { days: 20, label: "20D" },
  { days: 45, label: "45D" },
  { days: 90, label: "90D" },
] as const;

type DebateVoice = { role: string; argument: string };

type SignalCard = {
  ticker: string;
  name: string | null;
  stance: "bullish" | "bearish" | "NO TRADE";
  stanceLabel: string;
  score: number;
  confidence: number | null;
  confidenceDamped: boolean;
  risk: string;
  horizonLabel: string;
  expectedReturn20dPct: number | null;
  costAssumptionPct: number;
  bandWidthPct: number | null;
  drivers: { source: string; detail: string; direction: string; contribution: number; weight: number }[];
  noTradeReason: string | null;
  unavailable: string[];
  debate: DebateVoice[];
  debateStatus: string;
  verdict: string;
  aiVeto: boolean;
  model: string | null;
  label: string;
  disclaimer: string;
};

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/** Debounced symbol search over the keyless Yahoo embed. */
function SymbolSearch({ onPick, picked }: { onPick: (hit: SearchHit) => void; picked: SearchHit | null }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setHits([]);
      return;
    }
    const ctl = new AbortController();
    const iv = setTimeout(async () => {
      setBusy(true);
      setErr(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(t)}`, { signal: ctl.signal });
        const j = (await res.json()) as { ok: boolean; results?: SearchHit[]; error?: string };
        if (!j.ok) throw new Error(j.error ?? "search failed");
        setHits(j.results ?? []);
        setOpen(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => {
      clearTimeout(iv);
      ctl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="tt-searchbox" ref={boxRef}>
      <input
        type="search"
        value={q}
        placeholder="Search any stock — name or ticker…"
        aria-label="Search stocks"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
      />
      {busy && <span className="tt-search-spin" aria-hidden />}
      {open && hits.length > 0 && (
        <ul className="tt-search-results" role="listbox">
          {hits.map((h) => (
            <li key={`${h.exchange}:${h.symbol}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(h);
                  setOpen(false);
                  setQ("");
                }}
              >
                <strong>{h.symbol}</strong>
                <span>{h.name}</span>
                <em>{h.exchange ?? h.type ?? ""}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="tt-inline-err">Search unavailable — {err}. Type a ticker directly below.</p>}
      {picked && (
        <p className="tt-picked">
          Analyzing <strong>{picked.symbol}</strong> · {picked.name}
          {picked.exchange ? ` · ${picked.exchange}` : ""}
        </p>
      )}
    </div>
  );
}

/** The digital-twin fan: percentile bands replayed forward from the live price. */
function TwinFan({ sim }: { sim: Sim }) {
  const W = 860;
  const H = 240;
  const PAD = 8;
  const geo = useMemo(() => {
    if (sim.bands.length < 2) return null;
    const lo = Math.min(...sim.bands.map((b) => b.p10));
    const hi = Math.max(...sim.bands.map((b) => b.p90));
    const span = Math.max(hi - lo, 0.01);
    const x = (d: number) => PAD + (d / (sim.days)) * (W - PAD * 2);
    const y = (p: number) => H - PAD - ((p - lo) / span) * (H - PAD * 2);
    const line = (pick: (b: SimBand) => number) =>
      sim.bands.map((b, i) => `${i === 0 ? "M" : "L"}${x(b.day).toFixed(1)},${y(pick(b)).toFixed(1)}`).join(" ");
    const band = (a: (b: SimBand) => number, b: (b: SimBand) => number) =>
      `${sim.bands.map((s, i) => `${i === 0 ? "M" : "L"}${x(s.day).toFixed(1)},${y(a(s)).toFixed(1)}`).join(" ")} ` +
      `${[...sim.bands].reverse().map((s) => `L${x(s.day).toFixed(1)},${y(b(s)).toFixed(1)}`).join(" ")} Z`;
    return { x, y, p90Band: band((b) => b.p90, (b) => b.p10), p75Band: band((b) => b.p75, (b) => b.p25), med: line((b) => b.med), start: y(sim.lastPrice) };
  }, [sim]);

  if (!geo) return <p className="tt-faint">Simulation data unavailable.</p>;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tt-sim-svg" role="img" aria-label={`Digital twin simulation fan for ${sim.ticker}, ${sim.days} day horizon`}>
      <path d={geo.p90Band} className="tt-sim-band-outer" />
      <path d={geo.p75Band} className="tt-sim-band-inner" />
      <path d={geo.med} className="tt-sim-med" />
      <line x1={PAD} x2={W - PAD} y1={geo.start} y2={geo.start} className="tt-sim-start" />
      <text x={PAD + 2} y={geo.start - 4} className="tt-sim-start-label">now · {fmt(sim.lastPrice)}</text>
      <text x={W - PAD - 2} y={H - 2} textAnchor="end" className="tt-sim-axis">+{sim.days}d</text>
      <text x={PAD + 2} y={H - 2} className="tt-sim-axis">today</text>
    </svg>
  );
}

/**
 * AI Analyst workspace: the user picks any stock (search embed), reads its real
 * candles, and runs the digital twin over its own history. "Send to council"
 * hands the same symbol to the six-agent research pipeline.
 */
export default function AnalystWorkspace({ initialTicker }: { initialTicker?: string }) {
  const [picked, setPicked] = useState<SearchHit | null>(
    initialTicker ? { symbol: initialTicker.toUpperCase(), name: initialTicker.toUpperCase(), exchange: null, type: null } : null,
  );
  const [days, setDays] = useState<number>(20);
  const [sim, setSim] = useState<Sim | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simErr, setSimErr] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const ticker = picked?.symbol ?? "";

  const [card, setCard] = useState<SignalCard | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardErr, setCardErr] = useState<string | null>(null);

  const runSim = useCallback(async (t: string, d: number) => {
    setSimBusy(true);
    setSimErr(null);
    try {
      const res = await fetch(`/api/simulate?ticker=${encodeURIComponent(t)}&days=${d}`, { cache: "no-store" });
      const j = (await res.json()) as { ok: boolean; sim?: Sim; error?: string };
      if (!j.ok || !j.sim) throw new Error(j.error ?? `HTTP ${res.status}`);
      setSim(j.sim);
    } catch (e) {
      setSim(null);
      setSimErr((e as Error).message);
    } finally {
      setSimBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!ticker) return;
    void runSim(ticker, days);
  }, [ticker, days, runSim]);

  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    setCardBusy(true);
    setCardErr(null);
    fetch(`/api/signal?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok: boolean; card?: SignalCard; error?: string }) => {
        if (!alive) return;
        if (!j.ok || !j.card) throw new Error(j.error ?? "signal failed");
        setCard(j.card);
      })
      .catch((e: Error) => alive && (setCard(null), setCardErr(e.message)))
      .finally(() => alive && setCardBusy(false));
    return () => {
      alive = false;
    };
  }, [ticker]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="tt-card tt-analyst-search">
        <SymbolSearch onPick={setPicked} picked={picked} />
        <form
          className="tt-manual"
          onSubmit={(e) => {
            e.preventDefault();
            const t = manual.trim().toUpperCase();
            if (/^[A-Z0-9.\-^=]{1,12}$/.test(t)) setPicked({ symbol: t, name: t, exchange: null, type: null });
          }}
        >
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="or type a ticker (e.g. NVDA)" aria-label="Ticker" />
          <button type="submit" className="tt-btn tt-btn-ghost">Load</button>
        </form>
        {ticker && (
          <Link className="tt-btn tt-btn-primary tt-council-link" href={`/research?ticker=${encodeURIComponent(ticker)}&autorun=1`}>
            Send to council <span aria-hidden>→</span>
          </Link>
        )}
      </section>

      {!ticker && (
        <section className="tt-card tt-empty">
          <h2>Start with a symbol</h2>
          <p className="tt-sub">
            Search any listed stock above. TruffleTrade reads its live candles, then replays a calibrated digital twin
            of its own price history so you can see the shape of uncertainty — not a promise.
          </p>
        </section>
      )}

      {ticker && (
        <>
          <section className="tt-card">
            <div className="tt-card-head">
              <h2>{ticker} · live market</h2>
            </div>
            <CandleChart ticker={ticker} />
          </section>

          <section className={`tt-card tt-signal ${card?.stance === "NO TRADE" ? "tt-signal-flat" : card ? "tt-signal-live" : ""}`}>
            <div className="tt-card-head">
              <h2>Signal card · {ticker}</h2>
              {card && (
                <span className={`tt-pill ${card.stance === "NO TRADE" ? "tt-pill-flat" : "tt-pill-ok"}`}>
                  {card.stance === "NO TRADE" ? "NO TRADE" : card.stanceLabel}
                </span>
              )}
            </div>

            {cardBusy && <p className="tt-faint tt-loading">Gathering evidence from four legs + the debate bench…</p>}
            {cardErr && <p className="tt-inline-err">Signal unavailable — {cardErr}.</p>}

            {card && !cardBusy && (
              <div style={{ display: "grid", gap: 12 }}>
                <div className="tt-signal-grid">
                  <div className="tt-stat">
                    <span>Stance</span>
                    <strong>{card.stance === "NO TRADE" ? "NO TRADE" : `${card.stanceLabel}`}</strong>
                  </div>
                  <div className="tt-stat">
                    <span>Confidence</span>
                    <strong>
                      {card.confidence != null ? `${card.confidence}/100` : "—"}
                      {card.confidenceDamped && card.confidence != null ? " (damped)" : ""}
                    </strong>
                  </div>
                  <div className="tt-stat">
                    <span>Risk</span>
                    <strong>{card.risk}</strong>
                  </div>
                  <div className="tt-stat">
                    <span>Horizon</span>
                    <strong>{card.horizonLabel}</strong>
                  </div>
                  <div className="tt-stat">
                    <span>Expected 20d</span>
                    <strong>{card.expectedReturn20dPct != null ? pct(card.expectedReturn20dPct) : "—"}</strong>
                  </div>
                  <div className="tt-stat">
                    <span>Cost assumption</span>
                    <strong>{card.costAssumptionPct.toFixed(1)}%</strong>
                  </div>
                </div>

                {card.noTradeReason && (
                  <p className="tt-flat-note">
                    <strong>Why no trade:</strong> {card.noTradeReason}
                  </p>
                )}

                <div className="tt-driver-list">
                  {card.drivers.map((d) => (
                    <div key={d.source} className="tt-driver">
                      <span className={`tt-driver-dot ${d.direction}`} aria-hidden />
                      <span className="tt-driver-src">{d.source}</span>
                      <span className="tt-driver-detail">{d.detail}</span>
                      <span className="tt-driver-w">w {d.weight.toFixed(2)} · c {d.contribution.toFixed(2)}</span>
                    </div>
                  ))}
                  {card.unavailable.length > 0 && (
                    <p className="tt-faint" style={{ fontSize: 10.5 }}>Unavailable legs: {card.unavailable.join(" · ")}</p>
                  )}
                </div>

                <div className="tt-verdict">
                  <p className="tt-verdict-text">{card.verdict}</p>
                  {card.debate.length > 0 && (
                    <details className="tt-debate">
                      <summary>Adversarial debate — {card.debate.length} voices{card.aiVeto ? " · red team veto" : ""}</summary>
                      <div className="tt-debate-body">
                        {card.debate.map((v, i) => (
                          <p key={`${v.role}:${i}`}>
                            <strong>{v.role}</strong> — {v.argument}
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                  {card.debateStatus === "unavailable" && (
                    <p className="tt-faint" style={{ fontSize: 10.5 }}>Debate unavailable — card downgraded to NO TRADE (fail-closed).</p>
                  )}
                </div>

                <p className="tt-model-badge">
                  <span className="tt-badge tt-badge-model">{card.label}</span> {card.disclaimer}
                </p>
              </div>
            )}
          </section>

          <section className="tt-card">
            <div className="tt-card-head">
              <h2>Digital twin · Monte Carlo replay</h2>
              <div className="tt-range-row" role="tablist" aria-label="Simulation horizon">
                {HORIZONS.map((h) => (
                  <button
                    key={h.days}
                    type="button"
                    role="tab"
                    aria-selected={days === h.days}
                    className={days === h.days ? "is-active" : ""}
                    onClick={() => setDays(h.days)}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </div>

            {simBusy && <p className="tt-faint tt-loading">Replaying {sim?.paths ?? 60}+ twin paths…</p>}
            {simErr && (
              <p className="tt-inline-err">
                Simulation unavailable — {simErr}. The twin refuses to invent data when history is thin or the feed is
                down.
              </p>
            )}
            {sim && !simBusy && (
              <>
                <TwinFan sim={sim} />
                <div className="tt-stat-row">
                  <div className="tt-stat"><span>Up paths</span><strong>{sim.upProbabilityPct}%</strong></div>
                  <div className="tt-stat"><span>Mean path</span><strong>{pct(sim.meanReturnPct)}</strong></div>
                  <div className="tt-stat"><span>5th–95th</span><strong>{pct(sim.p05Pct)} … {pct(sim.p95Pct)}</strong></div>
                  <div className="tt-stat"><span>Worst drawdown</span><strong>{pct(-Math.abs(sim.maxDrawdownPct))}</strong></div>
                  <div className="tt-stat"><span>Daily σ</span><strong>{fmt(sim.sigmaDailyPct)}%</strong></div>
                  <div className="tt-stat"><span>Calibrated on</span><strong>{sim.sourceCandles} closes</strong></div>
                </div>
                <p className="tt-model-badge">
                  <span className="tt-badge tt-badge-model">{sim.label}</span> {sim.caveat}
                </p>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
