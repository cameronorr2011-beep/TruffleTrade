import type { ReactNode } from "react";
import Link from "next/link";
import CookieConsent from "@/components/site/CookieConsent";
import Logo from "@/components/site/Logo";
import { JsonLd } from "@/components/site/JsonLd";
import { REPO_URL, organizationJsonLd, websiteJsonLd } from "@/lib/seo";

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/install", label: "Install" },
  { href: "/blog", label: "Blog" },
  { href: "/dashboard", label: "Dashboard" },
];

const FOOTER_COLS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/#product", label: "The council" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/install", label: "Install for Windows" },
      { href: "/buy", label: "Get access" },
      { href: "/dashboard", label: "Live dashboard" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/blog", label: "Field notes" },
      { href: "/blog/why-six-analysts-beat-one-model", label: "Why rivals beat one model" },
      { href: "/blog/memory-that-trains-itself", label: "A memory that trains itself" },
      { href: "/blog/no-kyc-no-keys-no-nonsense", label: "No KYC, no keys" },
      { href: "/feed.xml", label: "RSS feed" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: REPO_URL, label: "Source on GitHub (MIT)", external: true },
      { href: `${REPO_URL}/issues`, label: "Support & contact", external: true },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
];

/**
 * Marketing chrome — applies ONLY to the public site routes in this group
 * (/, /buy, /install, /blog, /privacy, /terms, /admin). The paid app renders
 * in src/app/(app) with its own dark shell and never sees these headers.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tt-site">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-truffle-500 focus:px-4 focus:py-2 focus:text-[12px] focus:font-bold focus:text-[#1b1307]"
      >
        Skip to content
      </a>
      <header className="fixed inset-x-0 top-0 z-[65] border-b border-white/[0.06] bg-void/70 backdrop-blur-xl supports-[backdrop-filter]:bg-void/60">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-truffle-400/40 to-transparent" />
        <nav className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-3 sm:px-8" aria-label="Primary">
          <Link href="/" className="group flex items-center gap-2.5" aria-label="TruffleTrade home">
            <Logo size={34} className="transition-transform duration-300 group-hover:rotate-[-6deg]" />
            <span className="text-[1.2rem] font-extrabold tracking-[-1.1px] text-ink">
              truffle<span className="font-semibold text-truffle-400">trade</span>
              <span className="text-forest">.</span>
            </span>
          </Link>
          <div className="flex items-center gap-5">
            <div className="hidden items-center gap-5 md:flex">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="gold-underline text-[11.5px] font-semibold text-bone-soft transition-colors hover:text-ink"
                >
                  {n.label}
                </Link>
              ))}
            </div>
            {/* Install + Get access grouped as one action cluster */}
            <div className="flex items-center gap-2">
              {/* wrapper carries the breakpoint: .btn-secondary sets display itself */}
              <span className="hidden sm:block">
                <Link href="/install" className="btn-secondary !px-4 !py-2.5 !text-[11px]">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <path d="M8 1.5a.75.75 0 0 1 .75.75v6.19l1.97-1.97a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.53a.75.75 0 0 1 1.06-1.06l1.97 1.97V2.25A.75.75 0 0 1 8 1.5ZM2.75 11a.75.75 0 0 1 .75.75v1.5h9v-1.5a.75.75 0 0 1 1.5 0v2.25a.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1-.75-.75v-2.25a.75.75 0 0 1 .75-.75Z" />
                  </svg>
                  Download
                </Link>
              </span>
              <Link href="/buy" className="btn-primary whitespace-nowrap !px-5 !py-2.5 !text-[11px]">
                Get access
              </Link>
            </div>
          </div>
        </nav>
      </header>

      <main id="main" className="relative pt-[57px]">
        {children}
      </main>

      <footer className="relative border-t border-white/[0.06] bg-soil-950/80 pb-10 pt-14">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-truffle-400/30 to-transparent" />
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <Link href="/" className="flex items-center gap-2.5" aria-label="TruffleTrade home">
                <Logo size={38} />
                <span className="text-[1.25rem] font-extrabold tracking-[-1.1px] text-ink">
                  truffle<span className="font-semibold text-truffle-400">trade</span>
                  <span className="text-forest">.</span>
                </span>
              </Link>
              <p className="mt-4 max-w-sm text-[12.5px] leading-relaxed text-bone-soft">
                AI stock-chart intelligence with a memory that trains itself. Nine rival analysts, a fact-checker and a
                red team on any chart — paid in sats, no KYC, open source.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <a href="/api/download/desktop" className="btn-secondary !px-4 !py-2 !text-[11px]">
                  Download for Windows
                </a>
                <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn-secondary !px-4 !py-2 !text-[11px]">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                  </svg>
                  Star on GitHub
                </a>
              </div>
            </div>
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-truffle-300">{col.title}</p>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) =>
                    l.external ? (
                      <li key={l.href}>
                        <a href={l.href} target="_blank" rel="noreferrer" className="text-[12.5px] text-bone-soft transition-colors hover:text-ink">
                          {l.label}
                        </a>
                      </li>
                    ) : (
                      <li key={l.href}>
                        <Link href={l.href} className="text-[12.5px] text-bone-soft transition-colors hover:text-ink">
                          {l.label}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-12 max-w-3xl text-[11.5px] leading-relaxed text-faint">
            TruffleTrade is analysis and research software — not investment advice, not a broker, and it does not
            place trades. Markets are risky; you can lose money. You must be 18+, or 13–17 with a parent or
            guardian&apos;s consent and supervision. Payments are in Bitcoin over Lightning (1,000 sats); subscriptions
            are per 30 days and don&apos;t auto-renew. You are responsible for your own capital, taxes, and your
            jurisdiction&apos;s rules.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5 text-[10px] font-semibold tracking-wide text-faint">
            <span className="flex items-center gap-2">
              <span aria-hidden className="live-dot" />
              Live market data · Yahoo Finance
            </span>
            <span>© {new Date().getFullYear()} TruffleTrade · MIT-licensed source</span>
          </div>
        </div>
      </footer>
      <CookieConsent />
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
    </div>
  );
}
