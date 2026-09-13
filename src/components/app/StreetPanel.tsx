"use client";

import { useEffect, useState } from "react";

type Ratings = {
  ticker: string;
  buy: number;
  hold: number;
  sell: number;
  total: number;
  consensus: string;
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
};

/** Street consensus widget — THIRD-PARTY OPINION, clearly labeled. */
export default function StreetPanel({ ticker }: { ticker: string }) {
  const [data, setData] = useState<{ ok: boolean; ratings?: Ratings; price?: number | null; disclaimer?: string; error?: string } | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setErr(false);
    fetch(`/api/street?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((j) => alive && setData(j))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [ticker]);

  if (err) return null; // panel is optional chrome; silence on failure
  if (!data) {
    return (
      <section className="tt-card" aria-busy="true">
        <div className="tt-card-head"><h2>Street consensus</h2></div>
        <div className="tt-skel tt-skel-chart" style={{ height: 90 }} />
      </section>
    );
  }
  if (!data.ok || !data.ratings) {
    return (
      <section className="tt-card">
        <div className="tt-card-head"><h2>Street consensus</h2></div>
        <p className="tt-faint">Analyst consensus unavailable for {ticker} — not invented.</p>
      </section>
    );
  }

  const r = data.ratings;
  const pctW = (n: number) => (r.total ? (n / r.total) * 100 : 0);
  const upside = r.targetMean != null && data.price ? ((r.targetMean - data.price) / data.price) * 100 : null;

  return (
    <section className="tt-card">
      <div className="tt-card-head">
        <h2>Street consensus · {ticker}</h2>
        <span className="tt-badge tt-badge-model">THIRD-PARTY OPINION</span>
      </div>
      <p className="tt-street-consensus">{r.consensus.toUpperCase()} · {r.total} analysts</p>
      <div className="tt-street-bars" role="img" aria-label={`${r.buy} buy, ${r.hold} hold, ${r.sell} sell`}>
        <span className="tt-street-seg buy" style={{ width: `${pctW(r.buy)}%` }} />
        <span className="tt-street-seg hold" style={{ width: `${pctW(r.hold)}%` }} />
        <span className="tt-street-seg sell" style={{ width: `${pctW(r.sell)}%` }} />
      </div>
      <div className="tt-stat-row">
        <div className="tt-stat"><span>Buy</span><strong className="tt-pos">{r.buy}</strong></div>
        <div className="tt-stat"><span>Hold</span><strong>{r.hold}</strong></div>
        <div className="tt-stat"><span>Sell</span><strong className="tt-neg">{r.sell}</strong></div>
        <div className="tt-stat"><span>Mean target</span><strong>{r.targetMean?.toFixed(0) ?? "—"}</strong></div>
        <div className="tt-stat"><span>vs spot</span><strong className={upside != null ? (upside >= 0 ? "tt-pos" : "tt-neg") : ""}>{upside != null ? `${upside >= 0 ? "+" : ""}${upside.toFixed(0)}%` : "—"}</strong></div>
        <div className="tt-stat"><span>Range</span><strong>{r.targetLow?.toFixed(0) ?? "—"}–{r.targetHigh?.toFixed(0) ?? "—"}</strong></div>
      </div>
      <p className="tt-model-badge"><span className="tt-badge tt-badge-model">NOT MODEL OUTPUT</span> {data.disclaimer}</p>
    </section>
  );
}
