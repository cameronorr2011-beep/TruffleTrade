"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/accessCodeClient";

type Twin = {
  ticker: string; direction: "up" | "down" | "flat"; confidencePct: number;
  meanReturnPct: number; p05Pct: number; p95Pct: number; upProbabilityPct: number;
  paths: number; horizonDays: number; calibration: "thin" | "moderate" | "strong";
  calibrationScore: number; sourceCandles: number; label: "MODEL OUTPUT"; caveat: string;
};
type News = { ticker: string; score: number; label: string; headlineCount: number; posCount: number; negCount: number; labelType: "MODEL OUTPUT" };
type Macro = { riskOn: boolean | null; score: number; label: string; drivers: { symbol: string; label: string; changePct: number | null }[]; labelType: "MODEL OUTPUT" };
type Prediction = {
  ticker: string; stance: "bullish" | "bearish" | "neutral"; score: number;
  agreement: "cross-confirmed" | "mixed" | "thin";
  drivers: { source: string; detail: string; weight: number; contribution: number }[];
  unavailable: string[]; horizonDays: number; label: "MODEL OUTPUT"; disclaimer: string;
};
type Payload = {
  ok: boolean;
  twin?: Twin | null; twinUnavailable?: string | null;
  news?: News; macro?: Macro; prediction?: Prediction; error?: string;
};

const DEFAULTS = ["NVDA", "AAPL", "MSFT", "TSLA", "AMD", "BTC"];

function dirColor(d: string) { return d === "up" ? "var(--app-pos)" : d === "down" ? "var(--app-neg)" : "var(--app-ink-soft)"; }
function scoreColor(n: number) { return n > 0.15 ? "var(--app-pos)" : n < -0.15 ? "var(--app-neg)" : "var(--app-ink-soft)"; }

export default function MarketIntelPanel({ ticker, onTickerChange }: { ticker: string; onTickerChange: (t: string) => void }) {
  const [input, setInput] = useState(ticker);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setInput(ticker); }, [ticker]);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/intelligence?ticker=${encodeURIComponent(t)}`, { headers: authHeaders() });
      const j = (await res.json()) as Payload;
      if (!j.ok) throw new Error(j.error ?? "unavailable");
      setData(j);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(ticker); }, [ticker, load]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const iv = setInterval(() => load(ticker), 120_000);
    return () => clearInterval(iv);
  }, [ticker, load]);

  const twin = data?.twin ?? null;
  const pred = data?.prediction ?? null;
  const news = data?.news ?? null;
  const macro = data?.macro ?? null;

  return (
    <section className="tt-card tt-card-pad" aria-label="Digital twin confidence and market prediction">
      <div className="tt-pagehead" style={{ marginBottom: 12 }}>
        <h2>Market intelligence</h2>
        <span className="tt-pill">MODEL OUTPUT</span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); const t = input.trim().toUpperCase(); if (t) onTickerChange(t); }}
          style={{ display: "flex", gap: 6 }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="TICKER"
            aria-label="Ticker"
            style={{ width: 92, background: "#0f1713", border: "1px solid var(--app-line-strong)", borderRadius: 8, color: "var(--app-ink)", fontSize: 13, fontWeight: 600, padding: "7px 10px", outline: "none" }}
          />
          <button type="submit" className="tt-btn tt-btn-primary" style={{ padding: "7px 14px" }}>Analyze</button>
        </form>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {DEFAULTS.map((t) => (
            <button key={t} onClick={() => onTickerChange(t)} className="tt-btn tt-btn-ghost" style={{ padding: "7px 10px", borderColor: t === ticker ? "var(--app-accent)" : undefined, color: t === ticker ? "var(--app-ink)" : undefined }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && <p className="tt-empty">Running the digital twin…</p>}
      {error && <p className="tt-error">Intelligence unavailable — {error}</p>}

      {data && (
        <div style={{ display: "grid", gap: 12 }}>
          {/* Digital-twin confidence */}
          <div style={{ border: "1px solid var(--app-line)", borderRadius: 10, padding: "13px 14px", background: "#101814" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "var(--app-ink-faint)" }}>Digital twin · {twin?.horizonDays ?? 20}d outlook</h3>
              {twin && <span className={`tt-pill ${twin.calibration === "strong" ? "tt-pill-ok" : twin.calibration === "thin" ? "tt-pill-warn" : ""}`}>calibration: {twin.calibration}</span>}
            </div>
            {twin ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 8 }}>
                  <strong style={{ fontSize: 26, fontWeight: 800, color: dirColor(twin.direction) }}>
                    {twin.direction === "up" ? "▲" : twin.direction === "down" ? "▼" : "■"} {twin.confidencePct}%
                  </strong>
                  <span className="tt-muted" style={{ fontSize: 12 }}>
                    band {twin.p05Pct.toFixed(1)}% → {twin.p95Pct.toFixed(1)}% · mean {twin.meanReturnPct.toFixed(1)}% · P(up) {twin.upProbabilityPct}%
                  </span>
                </div>
                <p className="tt-faint" style={{ fontSize: 10, marginTop: 6 }}>{twin.caveat}</p>
              </>
            ) : (
              <p className="tt-empty">Twin unavailable — {data?.twinUnavailable ?? "no data"}</p>
            )}
          </div>

          {/* Cross-referenced prediction */}
          {pred && (
            <div style={{ border: "1px solid var(--app-line)", borderRadius: 10, padding: "13px 14px", background: "#101814" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "var(--app-ink-faint)" }}>Prediction · twin × sentiment × trend</h3>
                <span className={`tt-pill ${pred.agreement === "cross-confirmed" ? "tt-pill-ok" : pred.agreement === "mixed" ? "tt-pill-warn" : "tt-pill-bad"}`}>
                  {pred.agreement}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 8 }}>
                <strong style={{ fontSize: 22, fontWeight: 800, color: pred.stance === "bullish" ? "var(--app-pos)" : pred.stance === "bearish" ? "var(--app-neg)" : "var(--app-ink)" }}>
                  {pred.stance.toUpperCase()}
                </strong>
                <span className="tt-muted" style={{ fontSize: 12, color: scoreColor(pred.score) }}>score {pred.score.toFixed(2)}</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 5 }}>
                {pred.drivers.map((d, i) => (
                  <li key={i} style={{ display: "flex", gap: 8, fontSize: 11.5 }}>
                    <span className="tt-pill" style={{ minWidth: 88, justifyContent: "center" }}>{d.source}</span>
                    <span className="tt-muted" style={{ flex: 1 }}>{d.detail}</span>
                    <span style={{ color: scoreColor(d.contribution), fontWeight: 700 }}>{d.contribution >= 0 ? "+" : ""}{d.contribution.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              {pred.unavailable.length > 0 && (
                <p className="tt-faint" style={{ fontSize: 10, marginTop: 8 }}>Legs unavailable (stance damped): {pred.unavailable.join(" · ")}</p>
              )}
              <p className="tt-faint" style={{ fontSize: 10, marginTop: 8 }}>{pred.disclaimer}</p>
            </div>
          )}

          {/* Sentiment row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ border: "1px solid var(--app-line)", borderRadius: 10, padding: "12px 13px", background: "#101814" }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "var(--app-ink-faint)" }}>News sentiment</h3>
              {news && news.label !== "unavailable" ? (
                <>
                  <strong style={{ fontSize: 18, fontWeight: 800, color: scoreColor(news.score) }}>{news.label}</strong>
                  <p className="tt-faint" style={{ fontSize: 10.5, marginTop: 4 }}>{news.posCount} positive / {news.negCount} negative of {news.headlineCount} headlines</p>
                </>
              ) : (
                <p className="tt-empty">Headlines unavailable</p>
              )}
            </div>
            <div style={{ border: "1px solid var(--app-line)", borderRadius: 10, padding: "12px 13px", background: "#101814" }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "var(--app-ink-faint)" }}>Macro tape</h3>
              {macro && macro.label !== "unavailable" ? (
                <>
                  <strong style={{ fontSize: 18, fontWeight: 800, color: macro.riskOn === true ? "var(--app-pos)" : macro.riskOn === false ? "var(--app-neg)" : "var(--app-ink)" }}>{macro.label}</strong>
                  <p className="tt-faint" style={{ fontSize: 10.5, marginTop: 4 }}>
                    {macro.drivers.slice(0, 3).map((d) => `${d.symbol} ${d.changePct != null ? `${d.changePct >= 0 ? "+" : ""}${d.changePct.toFixed(1)}%` : "—"}`).join(" · ")}
                  </p>
                </>
              ) : (
                <p className="tt-empty">Macro providers unreachable</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
