"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/accessCodeClient";

type Alert = { ruleId: string; ticker: string; severity: "info" | "warning" | "critical"; message: string; value: number | null; provider: string | null; ts: number };
type Catalyst = { ticker: string; label: string; title: string; link: string; source: string; publishedAt: number; note: string };
type Payload = {
  ok: boolean;
  results?: { ticker: string; alerts: Alert[]; unavailable: string[] }[];
  catalysts?: { ticker: string; items: Catalyst[] }[];
  error?: string;
};

const SEV_STYLE: Record<Alert["severity"], string> = {
  critical: "tt-pill-bad",
  warning: "tt-pill-warn",
  info: "tt-pill-ok",
};

function age(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function AlertsPanel({ tickers }: { tickers: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts?tickers=${encodeURIComponent(tickers)}`, { headers: authHeaders() });
      const j = (await res.json()) as Payload;
      if (!j.ok) throw new Error(j.error ?? "unavailable");
      setData(j);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tickers]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  const alerts = (data?.results ?? []).flatMap((r) => r.alerts);
  const catalysts = (data?.catalysts ?? []).flatMap((c) => c.items);

  return (
    <section className="tt-card tt-card-pad" aria-label="Deterministic alerts and upcoming events">
      <div className="tt-pagehead" style={{ marginBottom: 10 }}>
        <h2>
          <span className="tt-live" style={{ display: "inline-block", marginRight: 8 }} />
          Alerts
        </h2>
        <span className="tt-faint" style={{ fontSize: 10 }}>
          deterministic rules · provider-stamped
        </span>
      </div>

      {loading && !data && <p className="tt-empty">Scanning market rules…</p>}
      {error && <p className="tt-error">Alert engine unavailable — {error}</p>}

      {data && alerts.length === 0 && catalysts.length === 0 && (
        <p className="tt-empty">No rule triggers right now. Quiet tape.</p>
      )}

      {alerts.length > 0 && (
        <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: "0 0 14px" }}>
          {alerts.slice(0, 8).map((a) => (
            <li key={`${a.ticker}-${a.ruleId}`} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className={`tt-pill ${SEV_STYLE[a.severity]}`}>{a.severity}</span>
              <span style={{ fontWeight: 700, minWidth: 52 }}>{a.ticker}</span>
              <span className="tt-muted" style={{ fontSize: 12, flex: 1 }}>
                {a.message}
                {a.provider && <span className="tt-faint"> · {a.provider}</span>}
              </span>
              <span className="tt-faint" style={{ fontSize: 10 }}>{age(a.ts)}</span>
            </li>
          ))}
        </ul>
      )}

      {catalysts.length > 0 && (
        <>
          <p className="tt-kicker" style={{ marginBottom: 8 }}>Upcoming-event signals</p>
          <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
            {catalysts.slice(0, 5).map((c, i) => (
              <li key={`${c.ticker}-${i}`} style={{ display: "grid", gap: 2 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span className="tt-pill">{c.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>{c.ticker}</span>
                </div>
                <a href={c.link} target="_blank" rel="noreferrer" className="tt-muted" style={{ fontSize: 11.5, textDecoration: "none" }}>
                  {c.title}
                </a>
                <span className="tt-faint" style={{ fontSize: 10 }}>{c.note}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {data && (data.results ?? []).some((r) => r.unavailable.length > 0) && (
        <p className="tt-faint" style={{ fontSize: 10, marginTop: 12, borderTop: "1px solid var(--app-line)", paddingTop: 8 }}>
          Some rules skipped — data unavailable for: {(data.results ?? []).flatMap((r) => r.unavailable).slice(0, 2).join(" | ")}
        </p>
      )}
    </section>
  );
}
