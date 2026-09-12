"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import "@/app/app.css";

const NAV: { href: string; label: string; icon: string; badge?: string }[] = [
  { href: "/dashboard", label: "Overview", icon: "▦" },
  { href: "/markets", label: "Markets", icon: "◍" },
  { href: "/analyst", label: "AI Analyst", icon: "✦" },
  { href: "/watchlist", label: "Watchlist", icon: "★" },
  { href: "/compare", label: "Compare", icon: "⇄" },
];

const TOOLS = [
  { href: "/research", label: "Research history", icon: "⧗" },
];

type Sub = { ok: boolean; daysRemaining?: number };

/**
 * The paid desktop workspace shell. Pure product surface: no marketing links,
 * no purchase CTAs — the web property handles licensing; this is the terminal.
 * Topbar carries brand, live clock, and subscription status.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const [clock, setClock] = useState<string>("");
  const [sub, setSub] = useState<Sub | null>(null);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/gateway/verify", { cache: "no-store" });
        const j = (await res.json()) as Sub;
        if (alive) setSub(j);
      } catch {
        if (alive) setSub({ ok: false });
      }
    };
    load();
    const iv = setInterval(load, 10 * 60_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const subChip = sub
    ? sub.ok
      ? { text: `SUBSCRIPTION · ${sub.daysRemaining ?? "?"}d`, cls: "tt-pill-ok" }
      : { text: "SUBSCRIPTION · EXPIRED", cls: "tt-pill-bad" }
    : { text: "SUBSCRIPTION · …", cls: "" };

  return (
    <div className="tt-app">
      <div className="tt-shell">
        <aside className="tt-sidebar">
          <Link href="/dashboard" className="tt-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" />
            <span>
              <strong>
                truffle<em>trade</em>
              </strong>
              <small>Research terminal</small>
            </span>
          </Link>

          <p className="tt-nav-label">Workspace</p>
          <nav className="tt-nav">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={isActive(n.href) ? "is-active" : ""}>
                <span className="tt-ico" aria-hidden>{n.icon}</span>
                <span className="flex-1">{n.label}</span>
                {n.badge && <span className="tt-badge">{n.badge}</span>}
              </Link>
            ))}
          </nav>

          <p className="tt-nav-label">History</p>
          <nav className="tt-nav">
            {TOOLS.map((n) => (
              <Link key={n.href} href={n.href} className={isActive(n.href) ? "is-active" : ""}>
                <span className="tt-ico" aria-hidden>{n.icon}</span>
                <span className="flex-1">{n.label}</span>
              </Link>
            ))}
          </nav>

          <div className="tt-promo">
            <h3>Pick any stock. Let the twins argue over it.</h3>
            <p>Search a symbol, read the candles, and run digital-twin simulations grounded in its own history.</p>
            <Link href="/analyst">
              Open AI Analyst <span aria-hidden>→</span>
            </Link>
          </div>
          <p className="tt-faint tt-status-line">
            <span className="tt-live" style={{ width: 5, height: 5 }} />
            live data · memory on this device
          </p>
        </aside>

        <div className="tt-main">
          <header className="tt-topbar">
            <span className="tt-topbar-scrim" aria-hidden />
            <span className="tt-topbar-title">
              {NAV.find((n) => isActive(n.href))?.label ?? "TruffleTrade"}
            </span>
            <span className="tt-topbar-clock" aria-hidden>
              {clock}
            </span>
            <span className={`tt-pill ${subChip.cls} tt-topbar-sub`}>{subChip.text}</span>
          </header>
          <div className="tt-content">{children}</div>
        </div>
      </div>
    </div>
  );
}
