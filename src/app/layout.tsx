import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import CookieConsent from "@/components/site/CookieConsent";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TruffleTrade — AI stock-chart intelligence, memory included",
    template: "%s · TruffleTrade",
  },
  description:
    "TruffleTrade is an AI research system for stock traders: six rival analysts, a fact-checker and a red team investigate any chart. Memory that learns, federated across installs. 1,000 sats a month. No KYC.",
  applicationName: "TruffleTrade",
  keywords: [
    "AI stock analysis",
    "AI chart analysis",
    "open source trading research",
    "bitcoin lightning",
    "no kyc",
    "digital twin markets",
    "federated learning",
  ],
  icons: { icon: "/logo.svg" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#fafbf9",
  colorScheme: "light",
};

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/#product", label: "Product" },
  { href: "/install", label: "Install" },
  { href: "/blog", label: "Blog" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: "#fafbf9", colorScheme: "light" }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="relative min-h-screen bg-void antialiased">
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
            <div className="flex items-center gap-5">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="gold-underline hidden text-[11.5px] font-semibold text-bone-soft hover:text-ink sm:block"
                >
                  {n.label}
                </Link>
              ))}
              <a
                href="https://github.com/cameronorr2011-beep/AI-STOCK-TRADER"
                target="_blank"
                rel="noreferrer"
                className="gold-underline hidden text-[11.5px] font-semibold text-bone-soft hover:text-ink md:block"
              >
                GitHub
              </a>
              <Link href="/buy" className="btn-primary !py-2.5 !px-5">
                Get access
              </Link>
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
              <a href="https://github.com/cameronorr2011-beep/AI-STOCK-TRADER" target="_blank" rel="noreferrer" className="hover:text-ink">
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
      </body>
    </html>
  );
}
