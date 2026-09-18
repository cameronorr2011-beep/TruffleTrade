import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { DESCRIPTION, SITE_NAME, SITE_URL, TAGLINE } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "AI stock analysis",
    "AI chart analysis",
    "AI investment research",
    "open source trading software",
    "stock research tool",
    "bitcoin lightning",
    "no kyc",
    "digital twin markets",
    "federated learning",
    "truffletrade",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: { telephone: false, address: false, email: false },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
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
  // Google Search Console ownership verification.
  verification: {
    google: "3QqMPiKAxdmUzhfBN1Ow0QpgHPfrbxZ4tGcNDWvcc3s",
  },
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon-512.png" }],
  },
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
        {/* Vercel Analytics ships only with Vercel builds — in the packaged
            desktop app /_vercel/insights/script.js doesn't exist, so mounting
            it there logged a 404 + console error on every route. */}
        {process.env.VERCEL === "1" ? <Analytics /> : null}
      </body>
    </html>
  );
}
