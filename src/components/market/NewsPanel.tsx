"use client";

import { useEffect, useState } from "react";

type NewsItem = {
  title: string;
  source: string;
  link: string;
  publishedTs: number | null;
  ageMin: number | null;
};

function age(a: number | null) {
  if (a == null) return "";
  if (a < 60) return `${a}m ago`;
  if (a < 1440) return `${Math.floor(a / 60)}h ago`;
  return `${Math.floor(a / 1440)}d ago`;
}

export default function NewsPanel({ ticker }: { ticker: string }) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setError(null);
    const load = async () => {
      try {
        const res = await fetch(`/api/news/${encodeURIComponent(ticker)}`);
        const j = (await res.json()) as { ok?: boolean; items?: NewsItem[]; error?: string };
        if (!alive) return;
        if (!j.ok) throw new Error(j.error ?? "unavailable");
        setItems(j.items ?? []);
        setError(null);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [ticker]);

  return (
    <section className="card flex min-w-0 flex-col overflow-hidden" aria-label={`${ticker} live news`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="live-dot" />
          <h2 className="text-[13px] font-bold tracking-[-0.2px] text-ink">{ticker} — live news</h2>
        </div>
        <a
          href={`https://news.google.com/search?q=${encodeURIComponent(ticker + " stock")}`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-semibold text-forest hover:text-truffle-600"
        >
          Google News →
        </a>
      </div>
      <div className="min-h-[180px] flex-1">
        {error ? (
          <div className="flex h-[180px] items-center justify-center px-6 text-center text-[12px] text-faint">
            News unavailable: {error}
          </div>
        ) : items == null ? (
          <div className="flex h-[180px] items-center justify-center text-[12px] text-faint">Loading headlines…</div>
        ) : items.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center px-6 text-center text-[12px] text-faint">
            No recent headlines for {ticker}.
          </div>
        ) : (
          <ul>
            {items.slice(0, 6).map((n) => (
              <li key={n.link || n.title} className="border-t border-soil-600/80 first:border-t-0">
                <a href={n.link} target="_blank" rel="noreferrer" className="block px-5 py-3 transition-colors hover:bg-soil-950/60">
                  <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-ink">{n.title}</p>
                  <p className="mt-1 text-[10.5px] text-faint">
                    {n.source}
                    {n.ageMin != null && <span> · {age(n.ageMin)}</span>}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-soil-600 px-5 py-3 text-[10px] text-faint">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-1 w-1 rounded-full bg-jade" /> Live RSS · refreshes every 5 min
        </span>
        <span>The council reads these in every run</span>
      </div>
    </section>
  );
}
