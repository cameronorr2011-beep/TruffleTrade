// Shared SEO helpers. Every marketing page resolves its canonical URL from
// here so sitemap, robots, JSON-LD, and metadata can never drift apart.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "https://truffletrade.vercel.app") as string;

export const SITE_NAME = "TruffleTrade";
export const TAGLINE = "AI stock-chart intelligence, memory included";
export const DESCRIPTION =
  "TruffleTrade is AI stock analysis software for Windows: nine rival AI analysts, a fact-checker and a red team investigate any chart, then a local memory learns from every call. 1,000 sats a month over Bitcoin Lightning. No KYC. Open source.";
export const REPO_URL = "https://github.com/cameronorr2011-beep/TruffleTrade";
export const APP_VERSION = "1.1.4";
export const PRICE_SATS = 1000;

export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

type FaqItem = { question: string; answer: string };

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icon-512.png"),
      width: 512,
      height: 512,
    },
    description: TAGLINE,
    sameAs: [REPO_URL],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: `${REPO_URL}/issues`,
    },
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    description: DESCRIPTION,
    inLanguage: "en-US",
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: "FinanceApplication",
    applicationSubCategory: "Investment research",
    operatingSystem: "Windows 10/11",
    description: DESCRIPTION,
    softwareVersion: APP_VERSION,
    downloadUrl: absoluteUrl("/api/download/desktop"),
    installUrl: absoluteUrl("/install"),
    screenshot: absoluteUrl("/opengraph-image"),
    image: absoluteUrl("/opengraph-image"),
    author: { "@id": `${SITE_URL}/#organization` },
    license: `${REPO_URL}/blob/main/LICENSE`,
    offers: {
      "@type": "Offer",
      url: absoluteUrl("/buy"),
      price: "0.00001",
      priceCurrency: "BTC",
      availability: "https://schema.org/InStock",
      description: `30 days of TruffleTrade AI for ${PRICE_SATS.toLocaleString("en-US")} sats. Paid in Bitcoin over Lightning. No KYC, no auto-renewal.`,
    },
    featureList: [
      "Nine rival AI analysts with a fact-checker and a red team",
      "Versioned investment theses with audited forecast history",
      "Local memory system trained by digital-twin market simulators",
      "Live candlestick dashboard with keyless market data",
      "Federated learning across installations — hashed summaries only",
    ],
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

export function howToJsonLd(opts: { name: string; description: string; steps: { name: string; text: string }[]; totalTime?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: opts.name,
    description: opts.description,
    totalTime: opts.totalTime ?? "PT5M",
    estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
    tool: [{ "@type": "HowToTool", name: "Windows 10 or 11 PC" }],
    step: opts.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
      url: absoluteUrl(`/install#step-${i + 1}`),
    })),
  };
}

export function productJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${SITE_NAME} AI — 30-day access`,
    description: `Activation key for TruffleTrade AI: nine-analyst council, red team, backtester and memory for 30 days. ${PRICE_SATS.toLocaleString("en-US")} sats over Bitcoin Lightning, no KYC, no auto-renewal.`,
    image: absoluteUrl("/opengraph-image"),
    brand: { "@type": "Brand", name: SITE_NAME },
    category: "Software > Finance",
    offers: {
      "@type": "Offer",
      url: absoluteUrl("/buy"),
      price: "0.00001",
      priceCurrency: "BTC",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": `${SITE_URL}/#organization` },
    },
  };
}
