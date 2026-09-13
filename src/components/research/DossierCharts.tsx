import type { ResearchRun } from "@core/research/types";

/**
 * DossierCharts — pure server-rendered SVGs computed from the run's own data
 * pack (price/SMA/volume, RSI, MACD), the council verdicts (stance bars), and
 * the thesis scenarios (implied-move bars). No client JS; no fabricated data —
 * sections render only when their inputs exist.
 */

function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

function ema(values: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function PriceChart({ run, height = 240 }: { run: ResearchRun; height?: number }) {
  const candles = run.dataPack.candles1d.slice(-180);
  if (candles.length < 30) return null;
  const W = 1100;
  const H = height;
  const padL = 8;
  const padR = 56;
  const volH = Math.round(H * 0.18);
  const priceH = H - volH - 14;
  const closes = candles.map((c) => c.close);
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  const maxVol = Math.max(...candles.map((c) => c.volume), 1);
  const x = (i: number) => padL + (i / (candles.length - 1)) * (W - padL - padR);
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo || 1)) * (priceH - 12);
  const line = (vals: (number | null)[]) =>
    vals.map((v, i) => (v == null ? null : `${i === 0 || vals[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).filter(Boolean).join("");
  const last = closes[closes.length - 1];
  const lastY = y(last);
  const maxPoints = 30;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${run.ticker} 180-day price with SMA20/SMA50 and volume`}>
        {/* gridlines + price axis */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = lo + (hi - lo) * (1 - f);
          const gy = 6 + f * (priceH - 12);
          return (
            <g key={f}>
              <line x1={padL} x2={W - padR} y1={gy} y2={gy} stroke="var(--color-line, #e5e0d5)" strokeWidth="1" opacity="0.5" />
              <text x={W - padR + 6} y={gy + 3} fontSize="10" fill="var(--color-faint, #8a8577)" fontFamily="monospace">
                {v.toFixed(0)}
              </text>
            </g>
          );
        })}
        {/* volume */}
        {candles.map((c, i) => {
          const h = (c.volume / maxVol) * volH;
          return <rect key={i} x={x(i) - 1.5} y={priceH + 10 + (volH - h)} width="3" height={h} fill={c.close >= c.open ? "#3f8260" : "#a8543f"} opacity="0.45" />;
        })}
        {/* SMA50 under SMA20 under price */}
        <path d={line(s50)} fill="none" stroke="#8a7340" strokeWidth="1.4" opacity="0.9" />
        <path d={line(s20)} fill="none" stroke="#b08d3e" strokeWidth="1.4" opacity="0.9" />
        <path d={line(closes)} fill="none" stroke="#3f6f54" strokeWidth="2" />
        {/* last price marker */}
        <line x1={padL} x2={W - padR} y1={lastY} y2={lastY} stroke="#3f6f54" strokeDasharray="3 4" strokeWidth="1" opacity="0.6" />
        <text x={W - padR + 6} y={lastY + 3} fontSize="10" fontWeight="700" fill="#3f6f54" fontFamily="monospace">
          {last.toFixed(2)}
        </text>
        {/* legend */}
        <g fontSize="10" fontFamily="monospace">
          <text x={padL + 4} y={14} fill="#3f6f54">■ price</text>
          <text x={padL + 64} y={14} fill="#b08d3e">— SMA20</text>
          <text x={padL + 128} y={14} fill="#8a7340">— SMA50</text>
          <text x={padL + 196} y={14} fill="var(--color-faint, #8a8577)">▾ volume</text>
        </g>
      </svg>
      <figcaption className="mt-1 font-mono text-[0.58rem] text-faint">
        {candles.length} trading days · SMA20/50 computed from the same closes · source: {run.dataPack.quote.source}
      </figcaption>
    </figure>
  );
}

export function OscillatorPanels({ run }: { run: ResearchRun }) {
  const t = run.dataPack.technicals;
  const candles = run.dataPack.candles1d.slice(-120);
  if (candles.length < 30 || t.rsi14 == null) return null;
  const closes = candles.map((c) => c.close);
  const W = 540;
  const H = 150;

  // RSI band
  const rsiW = W;
  const ry = (v: number) => 8 + (1 - v / 100) * (H * 0.42 - 10);
  const rsiPts = closes.map((_, i) => i);
  void rsiPts;
  const macdLine = ema(closes, 12).map((v, i) => v - ema(closes, 26)[i]);
  const signalLine = ema(macdLine, 9);
  const macdHist = macdLine.map((v, i) => v - signalLine[i]);
  const mAbs = Math.max(...macdHist.map(Math.abs), 1e-9);
  const mTop = H * 0.58;
  const my = (v: number) => mTop + (H * 0.36) * (1 - (v / mAbs + 1) / 2);

  return (
    <figure className="card p-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="RSI-14 and MACD histogram">
        {/* RSI 14 (last 120 days, recomputed deterministically) */}
        <text x="4" y="12" fontSize="10" fontFamily="monospace" fill="var(--color-bone, #6f6a5c)">RSI-14</text>
        <line x1="0" x2={rsiW} y1={ry(70)} y2={ry(70)} stroke="#a8543f" strokeDasharray="4 4" strokeWidth="1" opacity="0.5" />
        <line x1="0" x2={rsiW} y1={ry(30)} y2={ry(30)} stroke="#3f8260" strokeDasharray="4 4" strokeWidth="1" opacity="0.5" />
        <text x={rsiW - 26} y={ry(70) - 3} fontSize="9" fontFamily="monospace" fill="#a8543f">70</text>
        <text x={rsiW - 26} y={ry(30) - 3} fontSize="9" fontFamily="monospace" fill="#3f8260">30</text>
        <RsiPath closes={closes} width={rsiW} height={H * 0.42} />
        {/* MACD */}
        <text x="4" y={mTop - 6} fontSize="10" fontFamily="monospace" fill="var(--color-bone, #6f6a5c)">MACD 12/26/9 (histogram)</text>
        <line x1="0" x2={W} y1={my(0)} y2={my(0)} stroke="var(--color-line, #e5e0d5)" strokeWidth="1" />
        {macdHist.map((v, i) => (
          <rect key={i} x={(i / macdHist.length) * W} y={Math.min(my(v), my(0))} width={Math.max(1, W / macdHist.length - 1)} height={Math.max(1, Math.abs(my(v) - my(0)))} fill={v >= 0 ? "#3f8260" : "#a8543f"} opacity="0.7" />
        ))}
      </svg>
      <figcaption className="mt-2 grid grid-cols-2 gap-2 font-mono text-[0.6rem] text-faint sm:grid-cols-4">
        <span>RSI14 <strong className="text-ink">{t.rsi14.toFixed(1)}</strong></span>
        <span>ATR% <strong className="text-ink">{t.atrPct?.toFixed(1) ?? "—"}</strong></span>
        <span>vol20 <strong className="text-ink">{t.realizedVol20Pct?.toFixed(0) ?? "—"}%</strong></span>
        <span>regime <strong className="text-ink">{t.trendRegime ?? "—"}</strong></span>
      </figcaption>
    </figure>
  );
}

function RsiPath({ closes, width, height }: { closes: number[]; width: number; height: number }) {
  // Wilder RSI over the visible window
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(0, d));
    losses.push(Math.max(0, -d));
  }
  let ag = gains.slice(1, 15).reduce((s, x) => s + x, 0) / 14;
  let al = losses.slice(1, 15).reduce((s, x) => s + x, 0) / 14;
  const rsis: (number | null)[] = closes.map(() => null);
  for (let i = 14; i < closes.length; i++) {
    if (i > 14) {
      ag = (ag * 13 + gains[i]) / 14;
      al = (al * 13 + losses[i]) / 14;
    }
    rsis[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  const ry = (v: number) => 16 + (1 - v / 100) * (height - 24);
  const d = rsis
    .map((v, i) => (v == null ? null : `${rsis[i - 1] == null || i === 14 ? "M" : "L"}${((i / (closes.length - 1)) * width).toFixed(1)} ${ry(v).toFixed(1)}`))
    .filter(Boolean)
    .join("");
  return <path d={d} fill="none" stroke="#6f5fa8" strokeWidth="1.6" />;
}

const STANCE_COLOR: Record<string, string> = {
  bullish: "#3f8260",
  bearish: "#a8543f",
  caution: "#b08d3e",
  neutral: "#8a8577",
  "insufficient-evidence": "#b5ae9e",
};

export function CouncilBars({ run }: { run: ResearchRun }) {
  const lines = run.consensus.lines;
  if (!lines.length) return null;
  const W = 540;
  const rowH = 30;
  const H = lines.length * rowH + 16;
  const mid = W / 2;
  return (
    <figure className="card p-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Council stances, weighted contribution">
        {lines.map((l, i) => {
          const w = (l.weight * l.selfConfidence) * (mid - 70);
          const signed = w * (l.stance === "bullish" ? 1 : l.stance === "bearish" ? -1 : l.stance === "caution" ? -0.35 : 0);
          const y = 12 + i * rowH;
          const color = STANCE_COLOR[l.stance] ?? STANCE_COLOR.neutral;
          return (
            <g key={l.agent}>
              <text x="4" y={y + 12} fontSize="10.5" fontFamily="monospace" fill="currentColor" opacity="0.85">{l.agent}</text>
              <line x1={mid - 70} x2={mid + 70} y1={y + 8} y2={y + 8} stroke="currentColor" opacity="0.15" />
              <rect
                x={signed >= 0 ? mid + 70 : mid + 70 - Math.abs(signed)}
                y={y + 2}
                width={Math.max(2, Math.abs(signed))}
                height="12"
                rx="2"
                fill={color}
              />
              <text x={W - 4} y={y + 12} fontSize="10" fontFamily="monospace" textAnchor="end" fill="currentColor" opacity="0.6">
                w {l.weight.toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 font-mono text-[0.58rem] text-faint">
        Bar = weight × self-confidence, direction colored by stance. Verified confidence may be lower after fact-check.
      </figcaption>
    </figure>
  );
}

export function ScenarioBars({ run }: { run: ResearchRun }) {
  const sc = run.thesis.scenarios;
  if (!sc.length) return null;
  const W = 540;
  const rowH = 34;
  const H = sc.length * rowH + 14;
  const maxAbs = Math.max(...sc.map((s) => Math.abs(s.impliedMovePct ?? 0)), 1);
  return (
    <figure className="card p-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Scenario implied moves (model scenarios, not targets)">
        {sc.map((s, i) => {
          const v = s.impliedMovePct;
          const y = 10 + i * rowH;
          const w = v != null ? (Math.abs(v) / maxAbs) * (W / 2 - 90) : 0;
          const neg = (v ?? 0) < 0;
          return (
            <g key={s.name}>
              <text x="4" y={y + 13} fontSize="10.5" fontFamily="monospace" fill="currentColor" opacity="0.85">
                {s.name} · {s.probabilityPct}%
              </text>
              {v != null && (
                <>
                  <rect x={neg ? W / 2 - 80 - w : W / 2 - 80} y={y} width={Math.max(2, w)} height="16" rx="3" fill={neg ? "#a8543f" : "#3f8260"} opacity="0.85" />
                  <text x={neg ? W / 2 - 86 - w : W / 2 - 72 + w} y={y + 12} fontSize="10" fontFamily="monospace" textAnchor={neg ? "end" : "start"} fill="currentColor" opacity="0.75">
                    {v >= 0 ? "+" : ""}
                    {v.toFixed(1)}%
                  </text>
                </>
              )}
              {v == null && (
                <text x={W / 2 - 72} y={y + 12} fontSize="10" fontFamily="monospace" fill="currentColor" opacity="0.5">
                  move unavailable
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 font-mono text-[0.58rem] text-faint">MODEL SCENARIO — assumption-driven outcomes, not price targets.</figcaption>
    </figure>
  );
}
