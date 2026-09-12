"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import "@/app/app.css";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "▦" },
  { href: "/markets", label: "Markets", icon: "◍" },
  { href: "/desk", label: "Council desk", icon: "✦", badge: "9+1" },
  { href: "/watchlist", label: "Watchlist", icon: "★" },
  { href: "/compare", label: "Compare", icon: "⇄" },
];

const TOOLS = [
  { href: "/research", label: "Research history", icon: "⧗" },
  { href: "/blog", label: "Field notes", icon: "✉" },
  { href: "/buy", label: "Subscription", icon: "◇" },];

/**
 * The paid desktop workspace shell. Every product route renders inside it, so
 * the sidebar persists across navigation (active state follows the pathname)
 * instead of collapsing when you leave /dashboard.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

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
              <small>Desktop terminal</small>
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

          <p className="tt-nav-label">Tools</p>
          <nav className="tt-nav">
            {TOOLS.map((n) => (
              <Link key={n.href} href={n.href} className={isActive(n.href) ? "is-active" : ""}>
                <span className="tt-ico" aria-hidden>{n.icon}</span>
                <span className="flex-1">{n.label}</span>
              </Link>
            ))}
          </nav>

          <div className="tt-promo">
            <h3>Nine minds. One verdict you can argue with.</h3>
            <p>The council debates; a backtester checks it against history.</p>
            <Link href="/desk">
              Run an analysis <span aria-hidden>→</span>
            </Link>
          </div>
          <p className="tt-faint mt-4 flex items-center gap-2 px-2 text-[9px]">
            <span className="tt-live" style={{ width: 5, height: 5 }} /> live data · memory on this device
          </p>
        </aside>

        <div className="tt-main">
          <div className="tt-content">{children}</div>
          <nav className="tt-mobile-nav">
            {[...NAV, ...TOOLS].map((n) => (
              <Link key={n.href} href={n.href}>
                {n.icon} {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
