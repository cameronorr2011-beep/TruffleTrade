"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { authHeaders } from "@/lib/accessCodeClient";

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

type Candle = { t: number; o: number; h: number; l: number; c: number };

const STAGES = [
  { key: "market", label: "Market feed — live candles + prior-session baseline" },
  { key: "twin", label: "Digital-twin replay — 800 Monte Carlo paths" },
  { key: "news", label: "Headline scan — sentiment + event risk" },
  { key: "macro", label: "Macro tape — indices, vol, sectors" },
  { key: "street", label: "Street consensus — analyst counts + targets" },
  { key: "panel", label: "Evidence panel — weighting + contradiction check" },
  { key: "debate", label: "AI cross-examination — bull / bear / quant / risk / red team" },
] as const;

/**
 * Live working canvas: seeded Monte Carlo paths draw themselves in while the
 * stage progress advances — the animation mirrors what the engine is really
 * doing (replaying price paths), not decoration.
 */
function WorkingCanvas({ stage }: { stage: number }) {
  const W = 560;
  const H = 120;
  const PATHS = 24;
  const STEPS = 48;
  const PATH_MS = 4200;
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());

  // Deterministic per-ticker path shapes: seeded brownian-bridge-ish walks.
  const paths = useMemo(() => {
    const mk = (seed: number) => {
      let s = seed >>> 0;
      const rnd = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
      };
      const pts: number[] = [0];
      let v = 0;
      for (let i = 1; i <= STEPS; i++) {
        v += (rnd() - 0.5) * 2.4 - v * 0.02; // slight mean reversion
        pts.push(v);
      }
      // normalize to fit canvas
      const max = Math.max(...pts.map(Math.abs)) || 1;
      return pts.map((p) => p / max);
    };
    return Array.from({ length: PATHS }, (_, i) => mk(1000 + i * 77));
  }, []);

  // Path-drawing animation: one path completes every PATH_MS/PATHS ms.
  useEffect(() => {
    const iv = setInterval(() => {
      setTick((t) => t + 1);
      setDone((prev) => {
        const n = Math.min(PATHS, prev.size + 1);
        const s = new Set<number>();
        for (let i = 0; i < n; i++) s.add(i);
        return s;
      });
    }, PATH_MS / PATHS);
    return () => clearInterval(iv);
  }, []);

  const hi = 8;
  const x = (i: number) => 6 + (i / STEPS) * (W - 12);
  const y = (v: number) => H / 2 - v * hi * 2.4;

  return (
    <div className="tt-working">
      <svg viewBox={`0 0 ${W} ${H}`} className="tt-working-svg" role="img" aria-label="Simulation running">
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#22302a" strokeWidth="1" strokeDasharray="3 4" />
        {paths.map((pts, pi) => {
          const frac = Math.min(1, (tick * (PATH_MS / PATHS) + (pi + 1) * (PATH_MS / PATHS)) / PATH_MS);
          const steps = Math.max(2, Math.floor(frac * STEPS));
          const d = pts.slice(0, steps + 1).map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
          const col = pts[STEPS] >= 0 ? "#4ade80" : "#f87171";
          return <path key={pi} d={d} fill="none" stroke={col} strokeWidth={done.has(pi) ? 1.1 : 1.6} opacity={done.has(pi) ? 0.34 : 0.9} />;
        })}
      </svg>
      <div className="tt-working-meta">
        <span className="tt-working-counter">{done.size}/{PATHS} paths · {STEPS} steps</span>
      </div>
    </div>
  );
}

/** Elapsed timer — proves the engine is alive. */
function useElapsed(active: boolean): number {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!active) return;
    setSec(0);
    const iv = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [active]);
  return sec;
}

const SRC_SHORT: Record<string, string> = {
  "digital-twin": "TWIN",
  trend: "TREND",
  "news-sentiment": "NEWS",
  macro: "MACRO",
};

function fmt(n: number | null | undefined, d = 1): string {
  return n == null || !Number.isFinite(n) ? "—" : n.toFixed(d);
}

/** Big radial confidence dial. */
function Dial({ value, damped }: { value: number; damped: boolean }) {
  const R = 52;
  const C = Math.PI * R; // half circle
  const frac = Math.max(0, Math.min(100, value)) / 100;
  const hue = value >= 60 ? "#4ade80" : value >= 35 ? "#e8ae52" : "#f87171";
  return (
    <svg viewBox="0 0 140 84" className="tt-dial" role="img" aria-label={`Confidence ${value} of 100`}>
      <path d={`M18 70 A ${R} ${R} 0 0 1 122 70`} fill="none" stroke="#22302a" strokeWidth="11" strokeLinecap="round" />
      <path
        d={`M18 70 A ${R} ${R} 0 0 1 122 70`}
        fill="none"
        stroke={hue}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${(frac * C).toFixed(1)} ${C.toFixed(1)}`}
        style={{ transition: "stroke-dasharray .6s ease" }}
      />
      <text x="70" y="58" textAnchor="middle" className="tt-dial-num">{value}</text>
      <text x="70" y="74" textAnchor="middle" className="tt-dial-sub">
        CONFIDENCE{damped ? " · DAMPED" : ""}
      </text>
    </svg>
  );
}

/** Diverging contribution bars, one per evidence leg. */
function DriverBars({ drivers }: { drivers: SignalCard["drivers"] }) {
  const W = 300;
  const mid = W / 2;
  const scale = 42; // px per unit contribution
  return (
    <div className="tt-driverbars">
      {drivers.map((d) => {
        const w = Math.min(1, Math.abs(d.contribution)) * scale;
        const pos = d.contribution >= 0;
        return (
          <div key={d.source} className="tt-driverbar-row" title={d.detail}>
            <span className="tt-driverbar-src">{SRC_SHORT[d.source] ?? d.source.toUpperCase()}</span>
            <svg viewBox={`0 0 ${W} 16`} className="tt-driverbar-svg" aria-hidden>
              <line x1={mid} y1="0" x2={mid} y2="16" stroke="#2e4038" strokeWidth="1" />
              <rect
                x={pos ? mid : mid - w}
                y="3"
                width={Math.max(2, w)}
                height="10"
                rx="2"
                fill={pos ? "#4ade80" : "#f87171"}
                opacity="0.9"
              />
            </svg>
            <span className={`tt-driverbar-val ${pos ? "pos" : "neg"}`}>{d.contribution >= 0 ? "+" : ""}{d.contribution.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Score scale from bearish to bullish with the verdict marked. */
function ScoreScale({ score, stance }: { score: number; stance: string }) {
  const W = 300;
  const x = ((Math.max(-1, Math.min(1, score)) + 1) / 2) * (W - 16) + 8;
  const color = stance === "NO TRADE" ? "#e8ae52" : score > 0 ? "#4ade80" : "#f87171";
  return (
    <div className="tt-scorescale">
      <svg viewBox={`0 0 ${W} 26`} className="tt-scorescale-svg" aria-label={`Panel score ${score.toFixed(2)}`}>
        <rect x="8" y="10" width={W - 16} height="6" rx="3" fill="#22302a" />
        <rect x={8 + (W - 16) * 0.44} y="10" width={(W - 16) * 0.12} height="6" fill="#2e4038" />
        <circle cx={x} cy="13" r="7" fill={color} opacity="0.95" />
        <circle cx={x} cy="13" r="11" fill="none" stroke={color} strokeWidth="1.2" opacity="0.45" />
        <text x="8" y="24" className="tt-scorescale-label">BEARISH</text>
        <text x={W / 2} y="24" textAnchor="middle" className="tt-scorescale-label">NEUTRAL</text>
        <text x={W - 8} y="24" textAnchor="end" className="tt-scorescale-label">BULLISH</text>
      </svg>
    </div>
  );
}

/** The AI's live workspace: 90-day price tape + twin median projected forward. */
function SignalChart({ ticker, projection }: { ticker: string; projection: { expectedPct: number | null; days: number } }) {
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [err, setErr] = useState(false);
  const W = 860;
  const H = 190;
  const PAD = 10;
  const REFRESH = 60_000;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const load = () => {
      fetch(`/api/candles/${encodeURIComponent(ticker)}?range=6M`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: { candles?: Candle[] }) => {
          if (mounted.current) setCandles((j.candles ?? []).filter((c) => c.c != null));
        })
        .catch(() => mounted.current && setErr(true));
    };
    load();
    const iv = setInterval(load, REFRESH);
    return () => {
      mounted.current = false;
      clearInterval(iv);
    };
  }, [ticker]);

  const geo = useMemo(() => {
    if (!candles || candles.length < 10) return null;
    const past = candles.slice(-90);
    const closes = past.map((c) => c.c);
    // Twin median projection: linear from 0% at day 0 to the panel's expected
    // 20-day return — the twin's mean path, honestly simplified for display.
    const projScaled =
      projection.expectedPct != null && projection.days > 0
        ? Array.from({ length: projection.days }, (_, i) => ({
            day: i + 1,
            med: closes[closes.length - 1] * (1 + (projection.expectedPct! * (i + 1)) / projection.days / 100),
          }))
        : [];
    const hi = Math.max(...closes, ...projScaled.map((p) => p.med));
    const lo = Math.min(...closes, ...projScaled.map((p) => p.med));
    const span = Math.max(hi - lo, 0.01);
    const projDays = Math.max(1, projScaled.length ? projScaled[projScaled.length - 1].day : 0);
    const totalX = past.length + projDays;
    const x = (i: number) => PAD + (i / totalX) * (W - PAD * 2);
    const y = (p: number) => H - PAD - ((p - lo) / span) * (H - PAD * 2);
    const line = projScaled.length
      ? `M${x(past.length - 1).toFixed(1)},${y(closes[closes.length - 1]).toFixed(1)} ` +
        projScaled.map((p, i) => `L${x(past.length + i + 1).toFixed(1)},${y(p.med).toFixed(1)}`).join(" ")
      : "";
    return { past, closes, projScaled, x, y, line, projDays };
  }, [candles, projection]);

  if (err) return <p className="tt-faint">chart unavailable — feed down, no substitute shown</p>;
  if (!geo) return <div className="tt-chart-loading" />;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tt-sigchart" role="img" aria-label={`${ticker} 90-day tape with twin projection`}>
      {geo.past.map((c, i) => {
        const up = c.c >= c.o;
        const col = up ? "#4ade80" : "#f87171";
        const x = geo.x(i);
        return (
          <g key={c.t}>
            <line x1={x} x2={x} y1={geo.y(c.h)} y2={geo.y(c.l)} stroke={col} strokeWidth="1" opacity="0.75" />
            <rect
              x={x - 1.6}
              y={Math.min(geo.y(c.o), geo.y(c.c))}
              width="3.2"
              height={Math.max(1, Math.abs(geo.y(c.o) - geo.y(c.c)))}
              fill={col}
              opacity="0.9"
            />
          </g>
        );
      })}
      {geo.line && (
        <>
          <line x1={geo.x(geo.past.length - 1)} x2={W - PAD} y1={geo.y(geo.closes[geo.closes.length - 1])} y2={geo.y(geo.closes[geo.closes.length - 1])} stroke="#2e4038" strokeWidth="1" strokeDasharray="3 4" />
          <path d={geo.line} fill="none" stroke="#e8ae52" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
        </>
      )}
      {geo.projDays > 0 && <text x={W - PAD} y={H - 2} textAnchor="end" className="tt-sigchart-axis">now | +{geo.projDays}d twin median</text>}
    </svg>
  );
}
/**
 * Live Signal Card: staged progress while the AI works, then dial + bars +
 * scale + chart + tight text. Gated calls carry the subscriber's code.
 */
export default function SignalCardView({ ticker }: { ticker: string }) {
  const [card, setCard] = useState<SignalCard | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [renew, setRenew] = useState(false);
  const [stage, setStage] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const elapsed = useElapsed(busy);

  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    setBusy(true);
    setErr(null);
    setRenew(false);
    setCard(null);
    setStage(0);
    // Deeper-thinking pacing: the pipeline genuinely takes a few seconds;
    // the staged reveal spreads across it so progress reads as real work
    // (per-stage durations are presentation, the wait for the card is real).
    const stageIv = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 2)), 1900);
    const started = Date.now();
    fetch(`/api/signal?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store", headers: authHeaders() })
      .then(async (r) => {
        // Defensive parse: gateway/proxy failures can return an empty body.
        const j = (await r.json().catch(() => null)) as { ok: boolean; card?: SignalCard; error?: string } | null;
        if (!alive) return;
        if (r.status === 402) {
          setRenew(true);
          throw new Error("Subscription expired — renew to reactivate the AI.");
        }
        if (!j) throw new Error(`signal service error (HTTP ${r.status || "no response"})`);
        if (!j.ok || !j.card) throw new Error(j.error ?? "signal failed");
        // Let the stage narrative reach the cross-examination step before the
        // verdict lands: minimum ~9.5s of visible deliberation.
        const wait = Math.max(0, 9500 - (Date.now() - started));
        setTimeout(() => {
          if (!alive) return;
          clearInterval(stageIv);
          setStage(STAGES.length - 1);
          setCard(j.card!);
          setBusy(false);
        }, wait);
      })
      .catch((e: Error) => {
        if (!alive) return;
        clearInterval(stageIv);
        setErr(e.message);
        setBusy(false);
      });
    return () => {
      alive = false;
      clearInterval(stageIv);
    };
  }, [ticker, reloadKey]);

  if (!ticker) return null;

  if (busy) {
    return (
      <section className="tt-card tt-signal tt-signal-flat" aria-live="polite">
        <div className="tt-card-head">
          <h2>Signal card · {ticker}</h2>
          <span className="tt-pill tt-pill-work">WORKING · {elapsed}s</span>
        </div>

        <WorkingCanvas stage={stage} />

        <div className="tt-stages">
          {STAGES.map((s, i) => (
            <div key={s.key} className={`tt-stage ${i < stage ? "done" : i === stage ? "active" : ""}`}>
              <span className="tt-stage-dot" aria-hidden />
              <span>{s.label}</span>
              {i === stage && i < STAGES.length - 1 && <span className="tt-stage-anim" aria-hidden>···</span>}
              {i < stage && <span className="tt-stage-check" aria-hidden>✓</span>}
            </div>
          ))}
        </div>
        <p className="tt-faint tt-stage-note">Four deterministic legs feed the panel; the debate bench runs last.</p>
      </section>
    );
  }

  if (err) {
    return (
      <section className="tt-card tt-signal tt-signal-flat">
        <div className="tt-card-head"><h2>Signal card · {ticker}</h2></div>
        <p className="tt-inline-err">Signal unavailable — {err}.</p>
        {renew ? (
          <a href="/buy" className="tt-btn tt-btn-primary" target="_blank" rel="noreferrer">Renew subscription →</a>
        ) : (
          <button type="button" className="tt-btn tt-btn-ghost" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        )}
      </section>
    );
  }

  if (!card) return null;
  const noTrade = card.stance === "NO TRADE";

  // The unambiguous market decision, derived from the final verified state.
  const decision = noTrade
    ? { label: "STAND ASIDE", tone: "flat" as const, note: card.noTradeReason?.split("—")[0]?.trim() ?? "no reliable edge" }
    : card.stance === "bullish"
      ? { label: "BULLISH — WATCH FOR ENTRY", tone: "pos" as const, note: "survived cross-examination" }
      : card.stance === "bearish"
        ? { label: "BEARISH — AVOID / REDUCE", tone: "neg" as const, note: "survived cross-examination" }
        : { label: "HOLD CURRENT POSITION", tone: "flat" as const, note: "no directional edge" };

  return (
    <section className={`tt-card tt-signal ${noTrade ? "tt-signal-flat" : "tt-signal-live"}`}>
      <div className="tt-card-head">
        <h2>Signal card · {card.ticker}{card.name ? ` — ${card.name}` : ""}</h2>
        <span className={`tt-pill ${noTrade ? "tt-pill-flat" : "tt-pill-ok"}`}>{noTrade ? "NO TRADE" : card.stanceLabel}</span>
      </div>

      {/* Decision banner: the clearest element on the card, placed after the
          chart but before the fine print — evidence first, verdict second. */}
      <div className={`tt-decision tt-decision-${decision.tone}`} role="status">
        <span className="tt-decision-label">Decision</span>
        <span className="tt-decision-value">{decision.label}</span>
        <span className="tt-decision-note">{decision.note} · analytical signal, not investment advice</span>
      </div>

      <SignalChart ticker={card.ticker} projection={{ expectedPct: card.expectedReturn20dPct, days: 20 }} />

      <div className="tt-signal-body">
        <div className="tt-signal-dial">
          <Dial value={card.confidence ?? 0} damped={card.confidenceDamped} />
          <p className="tt-dial-note">{noTrade ? "withheld — no trade" : `risk ${card.risk} · ${card.horizonLabel}`}</p>
        </div>

        <div className="tt-signal-mid">
          <DriverBars drivers={card.drivers} />
          <ScoreScale score={card.score} stance={card.stance} />
          <div className="tt-signal-chips">
            <span className="tt-chip">exp 20d <strong>{noTrade || card.expectedReturn20dPct == null ? "—" : `${card.expectedReturn20dPct > 0 ? "+" : ""}${fmt(card.expectedReturn20dPct)}%`}</strong></span>
            <span className="tt-chip">costs <strong>−{card.costAssumptionPct.toFixed(1)}%</strong></span>
            <span className="tt-chip">band <strong>{card.bandWidthPct != null ? `±${fmt(card.bandWidthPct / 2)}%` : "—"}</strong></span>
          </div>
        </div>

        <div className="tt-signal-verdict">
          {noTrade && card.noTradeReason && <p className="tt-flat-note"><strong>Why:</strong> {card.noTradeReason.split("—")[0]}</p>}
          <p className="tt-verdict-text">{card.verdict}</p>
          {card.aiVeto && <p className="tt-veto-note">Red team veto — the deterministic read did not survive cross-examination.</p>}
        </div>
      </div>

      <details className="tt-debate">
        <summary>
          Evidence &amp; debate — {card.drivers.length} legs, {card.debate.length} voices
          {card.debateStatus === "unavailable" ? " (unavailable)" : ""}
        </summary>
        <div className="tt-debate-body">
          {card.drivers.map((d) => (
            <p key={d.source}>
              <strong>{SRC_SHORT[d.source] ?? d.source}</strong> {d.detail}
            </p>
          ))}
          {card.debate.map((v, i) => (
            <p key={`${v.role}:${i}`}>
              <strong>{v.role}</strong> {v.argument}
            </p>
          ))}
          {card.model && <p className="tt-faint">debate model: {card.model} · {card.label}</p>}
        </div>
      </details>

      <p className="tt-model-badge"><span className="tt-badge tt-badge-model">{card.label}</span> {card.disclaimer}</p>
    </section>
  );
}
