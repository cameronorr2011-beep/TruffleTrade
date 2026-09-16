import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
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

/**
 * Root layout: neutral chrome only (html/body, fonts, metadata).
 * Marketing header/footer live in the (site) route group; the paid app has
 * its own dark desktop shell in the (app) group — the two never mix.
 */
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
        {children}
        <Analytics />
      </body>
    </html>
  );
}
