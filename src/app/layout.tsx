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
  themeColor: "#0a0806",
  colorScheme: "dark",
};

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/install", label: "Install" },
  { href: "/blog", label: "Blog" },
  { href: "/#pricing", label: "Pricing" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: "#0a0806", colorScheme: "dark" }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Manrope:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="grain vignette relative min-h-screen bg-void antialiased">
        <header className="fixed inset-x-0 top-0 z-[65] border-b border-truffle-400/10 bg-void/80 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-3.5 sm:px-8">
            <Link href="/" className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="TruffleTrade logo" width={38} height={38} className="rounded-lg" />
              <span className="leading-none">
                <span className="font-display block text-[1.05rem] font-semibold tracking-tight text-bone">
                  TRUFFLE<span className="text-truffle-400">TRADE</span>
                </span>
                <span className="block font-mono text-[0.55rem] uppercase tracking-[0.34em] text-bone/40">
                  AI chart intelligence · Memory included
                </span>
              </span>
            </Link>
            <div className="flex items-center gap-5">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="gold-underline hidden font-mono text-[0.72rem] uppercase tracking-[0.2em] text-bone/70 hover:text-bone sm:block"
                >
                  {n.label}
                </Link>
              ))}
              <a
                href="https://github.com/cameronorr2011-beep/AI-STOCK-TRADER"
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-truffle-400/40 px-4 py-2 font-mono text-[0.66rem] uppercase tracking-[0.2em] text-truffle-300 transition-colors hover:bg-truffle-500/15"
              >
                GitHub
              </a>
            </div>
          </nav>
        </header>
        <main className="relative pt-16">{children}</main>
        <footer className="border-t border-truffle-400/10 py-10">
          <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[0.66rem] uppercase tracking-[0.2em] text-bone/50">
              <Link href="/privacy" className="hover:text-bone">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-bone">Terms</Link>
              <Link href="/blog" className="hover:text-bone">Blog</Link>
              <a href="https://github.com/cameronorr2011-beep/AI-STOCK-TRADER" target="_blank" rel="noreferrer" className="hover:text-bone">
                Source (MIT)
              </a>
            </div>
            <p className="mt-4 max-w-3xl text-[0.72rem] leading-relaxed text-bone/40">
              TruffleTrade is analysis and research software — not investment advice, not a broker, and it does not
              place trades. Markets are risky; you can lose money. You must be 18+, or 13–17 with a parent or
              guardian&apos;s consent and supervision. Payments are in Bitcoin Lightning via ZBD; subscriptions are
              per 30 days and don&apos;t auto-renew. You are responsible for your own capital, taxes, and your
              jurisdiction&apos;s rules.
            </p>
            <p className="mt-4 font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/30">
              Dig where the market hides its value · © {new Date().getFullYear()} TruffleTrade
            </p>
          </div>
        </footer>
        <CookieConsent />
      </body>
    </html>
  );
}
