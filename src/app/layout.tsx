import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono, Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { DESCRIPTION, SITE_NAME, SITE_URL, TAGLINE } from "@/lib/seo";
import "./globals.css";

// Self-hosted via next/font: no third-party font requests, no FOIT, and the
// packaged desktop app works offline. Exposed as CSS variables consumed by
// the Tailwind theme (--font-sans / --font-mono in globals.css).
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-manrope",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    // Keyword-bearing default ("AI stock analysis") — the tagline stays on OG/Twitter cards.
    default: `${SITE_NAME} — AI Stock Analysis with Nine Rival Analysts & a Memory`,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "AI stock analysis",
    "AI stock research software",
    "AI chart analysis",
    "AI investment research",
    "stock analysis app for Windows",
    "multi-agent AI trading research",
    "open source trading software",
    "stock research tool",
    "bitcoin lightning payment",
    "no KYC software",
    "digital twin markets",
    "federated learning",
    "truffletrade",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: { telephone: false, address: false, email: false },
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": `${SITE_URL}/feed.xml` },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: `${SITE_NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE_NAME} — ${TAGLINE}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large" as const,
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "finance",
  classification: "Finance software",
  referrer: "strict-origin-when-cross-origin",
  // Google Search Console ownership verification.
  verification: {
    google: "3QqMPiKAxdmUzhfBN1Ow0QpgHPfrbxZ4tGcNDWvcc3s",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: ["/icon-192.png"],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black-translucent" },
  other: { "msapplication-TileColor": "#0b0908" },
};

export const viewport: Viewport = {
  themeColor: "#0b0908",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

/**
 * Root layout: neutral chrome only (html/body, fonts, metadata).
 * Marketing header/footer live in the (site) route group; the paid app has
 * its own dark desktop shell in the (app) group — the two never mix.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${jetbrains.variable}`} style={{ backgroundColor: "#0b0908" }}>
      <body className="relative min-h-screen bg-void antialiased">
        {children}
        {/* Vercel Analytics ships only with Vercel builds — in the packaged
            desktop app /_vercel/insights/script.js doesn't exist, so mounting
            it there logged a 404 + console error on every route. */}
        {process.env.VERCEL === "1" ? <Analytics /> : null}
      </body>
    </html>
  );
}
