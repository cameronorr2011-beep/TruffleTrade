import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import CommandPalette from "@/components/research/CommandPalette";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "WOLFPIT — the autonomous BTC desk with a council of rivals",
    template: "%s · WOLFPIT",
  },
  description:
    "Five rival AI trading agents debate every Bitcoin trade. A red team tries to kill each idea before it ships. Fully auditable, autonomous, no KYC.",
  applicationName: "WOLFPIT",
  keywords: [
    "autonomous bitcoin trading",
    "AI trading council",
    "no kyc crypto trading",
    "red team AI",
    "open source trading bot",
  ],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#060409",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: "#060409", colorScheme: "dark" }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Manrope:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="grain vignette relative min-h-screen bg-void antialiased">
        <header className="fixed inset-x-0 top-0 z-[65] border-b border-pit-300/10 bg-void/80 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-3.5 sm:px-8">
            <Link href="/" className="flex items-center gap-3">
              <Sigil />
              <span className="leading-none">
                <span className="font-display block text-[1.05rem] font-semibold tracking-tight text-bone">
                  WOLF<span className="text-ember-300">PIT</span>
                </span>
                <span className="block font-mono text-[0.55rem] uppercase tracking-[0.34em] text-bone/40">
                  Council of rivals · BTC desk
                </span>
              </span>
            </Link>
            <div className="flex items-center gap-5">
              <Link href="/desk" className="ember-underline font-mono text-[0.72rem] uppercase tracking-[0.2em] text-bone/70 hover:text-bone">
                Desk
              </Link>
              <Link href="/markets" className="ember-underline hidden font-mono text-[0.72rem] uppercase tracking-[0.2em] text-bone/70 hover:text-bone sm:block">
                Markets
              </Link>
              <Link href="/research" className="ember-underline hidden font-mono text-[0.72rem] uppercase tracking-[0.2em] text-bone/70 hover:text-bone sm:block">
                Research
              </Link>
              <Link href="/watchlist" className="ember-underline hidden font-mono text-[0.72rem] uppercase tracking-[0.2em] text-bone/70 hover:text-bone sm:block">
                Watchlist
              </Link>
              <a
                href="https://github.com/cameronorr2011-beep/AI-STOCK-TRADER"
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-ember-400/40 px-4 py-2 font-mono text-[0.66rem] uppercase tracking-[0.2em] text-ember-200 transition-colors hover:bg-ember-500/15"
              >
                Source
              </a>
            </div>
          </nav>
        </header>
        <main className="relative pt-16">{children}</main>
        <CommandPalette />
        <footer className="border-t border-pit-300/10 py-10">
          <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
            <p className="max-w-3xl text-[0.72rem] leading-relaxed text-bone/40">
              WOLFPIT is open-source software, not investment advice. Crypto markets are volatile and
              autonomous trading can lose money quickly. Paper mode is the default; live mode is capped
              by KRAKEN_MAX_EXPOSURE_USD and a hard kill switch. You are responsible for your own keys,
              your own capital, and your own jurisdiction&apos;s rules.
            </p>
            <p className="mt-4 font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/30">
              The pit never sleeps · No KYC · Full transcript
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

function Sigil() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="35" height="35" rx="9" stroke="url(#g1)" strokeWidth="1.4" />
      <path d="M10 25l5-12 4 8 3-6 6 10" stroke="#f09a4f" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="28" cy="11" r="2.2" fill="#e2762f" />
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="38" y2="38">
          <stop stopColor="#8464d8" />
          <stop offset="1" stopColor="#e2762f" />
        </linearGradient>
      </defs>
    </svg>
  );
}
