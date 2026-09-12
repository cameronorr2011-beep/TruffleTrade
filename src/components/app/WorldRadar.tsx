"use client";

import { useCallback, useEffect, useState } from "react";

type WorldItem = { title: string; link: string; source: string; publishedTs: number; categories: string[] };

function age(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export default function WorldRadar() {
  const [items, setItems] = useState<WorldItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/world");
      const j = (await res.json()) as { ok: boolean; items?: WorldItem[]; error?: string };
      if (!j.ok) throw new Error(j.error ?? "unavailable");
      setItems(j.items ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 300_000);
    return () => clearInterval(iv);
  }, [load]);

  return (
    <section className="tt-card tt-card-pad" aria-label="Worldwide news radar">
      <div className="tt-pagehead" style={{ marginBottom: 10 }}>
        <h2>
          <span className="tt-live" style={{ display: "inline-block", marginRight: 8 }} />
          World radar
        </h2>
        <span className="tt-faint" style={{ fontSize: 10 }}>top stories · categorized</span>
      </div>

      {!items && !error && <p className="tt-empty">Loading worldwide headlines…</p>}
      {error && <p className="tt-error">World radar unavailable — {error}</p>}
      {items && items.length === 0 && <p className="tt-empty">No stories returned.</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 9 }}>
        {(items ?? []).map((it, i) => (
          <li key={i} style={{ display: "grid", gap: 3 }}>
            <a href={it.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--app-ink)", textDecoration: "none", lineHeight: 1.45 }}>
              {it.title}
            </a>
            <span className="tt-faint" style={{ fontSize: 10 }}>
              {it.categories.length > 0 && it.categories.map((c) => <span key={c} className="tt-pill" style={{ marginRight: 4, fontSize: 8.5, padding: "2px 6px" }}>{c}</span>)}
              {it.source} · {age(it.publishedTs)} ago
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
