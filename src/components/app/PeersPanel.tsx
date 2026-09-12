"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/accessCodeClient";

type Peer = {
  ticker: string; name: string | null; price: number | null;
  momentum21dPct: number | null; rsi14: number | null; relStrength21dPct: number | null;
  vol30Pct: number | null; peTtm: number | null; grossMarginPct: number | null;
  revenueGrowthYoYPct: number | null; provider: string; error?: string;
};
type Payload = {
  ok: boolean;
  ranking?: { subject: string; ranked: (Peer & { score?: number })[]; best: string | null; subjectIsBest: boolean; unavailable: string[]; scoredAt: number };
  error?: string;
};

function fmt(n: number | null, suffix = ""): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "" : ""}${n.toFixed(1)}${suffix}`;
}

export default function PeersPanel({ ticker }: { ticker: string }) {
  const [data, setData] = useState<Payload["ranking"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/peers?ticker=${encodeURIComponent(ticker)}`, { headers: authHeaders() });
      const j = (await res.json()) as Payload;
      if (!j.ok) throw new Error(j.error ?? "unavailable");
      setData(j.ranking ?? null);
      setError(null);
      } catch (e) {
      setError((e as Error).message);
    }
  }, [ticker]);

  useEffect(() => { load(); }, [load]);

  const scoreOf = (t: string) =>
    data?.ranked.findIndex((p) => p.ticker === t) === 0;

  return (
    <section className="tt-card tt-card-pad" aria-label="Competitor ranking">
      <div className="tt-pagehead" style={{ marginBottom: 10 }}>
        <h2>Competitor ranking — {ticker}</h2>
        {data?.best && (
          <span className={`tt-pill ${data.subjectIsBest ? "tt-pill-ok" : "tt-pill-warn"}`}>
            {data.subjectIsBest ? "subject is best" : `best: ${data.best}`}
          </span>
        )}
        {data && !data.subjectIsBest && data.best && ticker !== data.best && (
          <a href={`/company/${data.best}`} className="tt-btn tt-btn-ghost" style={{ padding: "5px 10px", fontSize: 10 }}>open {data.best} →</a>
        )}
      </div>

      {!data && !error && <p className="tt-empty">Scoring peers…</p>}
      {error && <p className="tt-error">Ranking unavailable — {error}</p>}
      {data && data.ranked.length === 0 && <p className="tt-empty">No peers mapped for {ticker} — ranked solo.</p>}

      {data && data.ranked.length > 0 && (
        <div className="overflow-x-auto">
          <table className="tt-table">
            <thead>
              <tr>
                <th>#</th><th>Ticker</th><th>Score</th><th>1M</th><th>vs SPY</th><th>RSI</th><th>Growth YoY</th><th>Margin</th><th>Vol</th>
              </tr>
            </thead>
            <tbody>
              {data.ranked.map((p, i) => (
                <tr key={p.ticker}>
                  <td className="tt-faint">{i + 1}</td>
                  <td>
                    <a href={`/company/${p.ticker}`} style={{ fontWeight: 700, color: "var(--app-ink)", textDecoration: "none" }}>{p.ticker}</a>
                  </td>
                  <td style={{ fontWeight: 800, color: i === 0 ? "var(--app-pos)" : "var(--app-ink-soft)" }}>{typeof p.score === "number" ? p.score.toFixed(2) : "—"}</td>
                  <td>{fmt(p.momentum21dPct, "%")}</td>
                  <td>{fmt(p.relStrength21dPct, "%")}</td>
                  <td>{fmt(p.rsi14)}</td>
                  <td>{fmt(p.revenueGrowthYoYPct, "%")}</td>
                  <td>{fmt(p.grossMarginPct, "%")}</td>
                  <td>{fmt(p.vol30Pct, "%")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.unavailable.length > 0 && (
        <p className="tt-faint" style={{ fontSize: 10, marginTop: 8 }}>Data unavailable for: {data.unavailable.join(" · ")}</p>
      )}
    </section>
  );
}
