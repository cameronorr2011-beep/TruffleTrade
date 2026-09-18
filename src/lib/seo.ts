// Shared SEO helpers. Every marketing page resolves its canonical URL from
// here so sitemap, robots, JSON-LD, and metadata can never drift apart.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "https://truffletrade.vercel.app") as string;

export const SITE_NAME = "TruffleTrade";
export const TAGLINE = "AI stock-chart intelligence, memory included";
export const DESCRIPTION =
  "TruffleTrade is an AI research system for stock traders: nine rival analysts, a fact-checker and a red team investigate any chart. Memory that learns on your device. 1,000 sats a month. No KYC.";
export const REPO_URL = "https://github.com/cameronorr2011-beep/TruffleTrade";

export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

type FaqItem = { question: string; answer: string };

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/logo.svg"),
    description: TAGLINE,
    sameAs: [REPO_URL],
  };
}

export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Windows 10/11",
    description: DESCRIPTION,
    softwareVersion: "1.1.4",
    offers: {
      "@type": "Offer",
      price: "0.00001",
      priceCurrency: "BTC",
      description: "30 days of TruffleTrade AI. Paid in Bitcoin over Lightning. No KYC, no auto-renewal.",
    },
    featureList: [
      "Nine rival AI analysts with a fact-checker and a red team",
      "Versioned investment theses with audited forecast history",
      "Local memory system trained by digital-twin market simulators",
      "Live candlestick dashboard with keyless market data",
      "Federated learning across installations — hashed summaries only",
    ],
    isAccessibleForFree: false,
  };
}

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
