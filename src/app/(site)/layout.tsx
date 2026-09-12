import type { ReactNode } from "react";
import Link from "next/link";
import CookieConsent from "@/components/site/CookieConsent";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/#product", label: "Product" },
  { href: "/blog", label: "Blog" },
];

/**
 * Marketing chrome — applies ONLY to the public site routes in this group
 * (/, /buy, /install, /blog, /privacy, /terms, /admin). The paid app renders
 * in src/app/(app) with its own dark shell and never sees these headers.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[65] border-b border-soil-600 bg-white/85 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="TruffleTrade logo" width={34} height={34} className="rounded-lg" />
            <span className="text-[1.25rem] font-extrabold tracking-[-1.2px] text-ink">
              truffle<span className="font-semibold text-truffle-500">trade</span>
              <span className="text-truffle-400">.</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="gold-underline hidden text-[11.5px] font-semibold text-bone-soft hover:text-ink sm:block"
              >
                {n.label}
              </Link>
            ))}
            {/* Install + Get access grouped as one action cluster */}
            <div className="flex items-center gap-2">
              <Link href="/install" className="btn-secondary !px-4 !py-2.5 !text-[11px]">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
                Install with GitHub
              </Link>
              <Link href="/buy" className="btn-primary !px-5 !py-2.5 !text-[11px]">
                Get access
              </Link>
            </div>
          </div>
        </nav>
      </header>
      <main className="relative pt-[57px]">{children}</main>
      <footer className="border-t border-soil-600 bg-white py-10">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11.5px] font-semibold text-bone-soft">
            <Link href="/privacy" className="hover:text-ink">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/blog" className="hover:text-ink">Blog</Link>
            <Link href="/dashboard" className="hover:text-ink">Dashboard</Link>
            <a href="https://github.com/cameronorr2011-beep/TruffleTrade" target="_blank" rel="noreferrer" className="hover:text-ink">
              Source (MIT)
            </a>
          </div>
          <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-bone-soft/90">
            TruffleTrade is analysis and research software — not investment advice, not a broker, and it does not
            place trades. Markets are risky; you can lose money. You must be 18+, or 13–17 with a parent or
            guardian&apos;s consent and supervision. Payments are in Bitcoin Lightning; subscriptions are per 30 days
            and don&apos;t auto-renew. You are responsible for your own capital, taxes, and your jurisdiction&apos;s rules.
          </p>
          <p className="mt-4 flex items-center gap-2 text-[10px] font-semibold tracking-wide text-bone-soft/70">
            <span aria-hidden className="live-dot" />
            Live market data · Yahoo Finance · © {new Date().getFullYear()} TruffleTrade
          </p>
        </div>
      </footer>
      <CookieConsent />
    </>
  );
}
