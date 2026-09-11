// Data providers — swappable abstractions (spec §33). Keyless where possible.
// Rule: if a source fails or is missing, return null and record why. Never invent data.

import type { Candle, DataPack, Fundamentals, NewsItem, Quote } from "./types";

const YAHOO = "https://query1.finance.yahoo.com";
const UA = "Mozilla/5.0 (compatible; TruffleTrade/1.0; research terminal)";

async function getJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

// ── MarketDataProvider ────────────────────────────────────────────────

interface YahooChart {
  chart: {
    error: { code: string; description: string } | null;
    result: {
      meta: {
        currency: string;
        symbol: string;
        fullExchangeName?: string;
        longName?: string;
        shortName?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        regularMarketTime?: number;
      };
      timestamp: number[];
      indicators: { quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }[] };
    }[];
  };
}

export async function yahooChart(
  ticker: string,
  range = "1y",
  interval = "1d",
): Promise<{ quote: Quote; candles: Candle[] }> {
  const url = `${YAHOO}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
  const j = await getJson<YahooChart>(url);
  if (j.chart.error) throw new Error(`Yahoo: ${j.chart.error.description}`);
  const r = j.chart.result[0];
  const m = r.meta;
  const q = r.indicators.quote[0];
  const candles: Candle[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = q.close[i];
    if (c == null) continue;
    candles.push({
      ts: r.timestamp[i] * 1000,
      open: q.open[i] ?? c,
      high: q.high[i] ?? c,
      low: q.low[i] ?? c,
      close: c,
      volume: q.volume[i] ?? 0,
    });
  }
  const price = m.regularMarketPrice ?? candles[candles.length - 1]?.close ?? null;
  const prevClose = m.previousClose ?? m.chartPreviousClose ?? null;
  const quote: Quote = {
    ticker: m.symbol ?? ticker.toUpperCase(),
    name: m.longName ?? m.shortName ?? null,
    exchange: m.fullExchangeName ?? null,
    currency: m.currency ?? "USD",
    price,
    prevClose,
    changePct: price != null && prevClose ? (price / prevClose - 1) * 100 : null,
    marketCap: null,
    fiftyTwoWeekHigh: m.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: m.fiftyTwoWeekLow ?? null,
    asOf: (m.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000,
    source: "yahoo:chart",
  };
  return { quote, candles };
}

interface YahooSummary {
  quoteSummary: {
    error: { description: string } | null;
    result: {
      summaryDetail?: {
        marketCap?: { raw: number };
        forwardPE?: { raw: number };
        trailingPE?: { raw: number };
        dividendYield?: { raw: number };
        beta?: { raw: number };
      };
      defaultKeyStatistics?: {
        sharesOutstanding?: { raw: number };
        trailingEps?: { raw: number };
      };
      financialData?: {
        totalRevenue?: { raw: number };
        ebitda?: { raw: number };
        netIncomeToCommon?: { raw: number };
        freeCashflow?: { raw: number };
        grossMargins?: { raw: number };
        operatingMargins?: { raw: number };
        profitMargins?: { raw: number };
        returnOnEquity?: { raw: number };
        totalDebt?: { raw: number };
        totalCash?: { raw: number };
        revenueGrowth?: { raw: number };
        currentPrice?: { raw: number };
        targetMeanPrice?: { raw: number };
      };
      assetProfile?: { sector?: string; industry?: string; longBusinessSummary?: string };
    }[];
  };
}

export interface SummaryData {
  fundamentals: Fundamentals;
  sector: string | null;
  industry: string | null;
  businessSummary: string | null;
  marketCap: number | null;
  targetMeanPrice: number | null;
}

// ── Yahoo cookie+crumb auth ───────────────────────────────────────────
// quoteSummary requires an A3 cookie + crumb since 2023. Cached process-wide.
let crumbCache: { cookie: string; crumb: string; ts: number } | null = null;
const CRUMB_TTL_MS = 30 * 60_000;

async function yahooCrumb(): Promise<{ cookie: string; crumb: string }> {
  if (crumbCache && Date.now() - crumbCache.ts < CRUMB_TTL_MS) {
    return { cookie: crumbCache.cookie, crumb: crumbCache.crumb };
  }
  // Step 1: collect the A3 consent cookie (response body is irrelevant).
  const cRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const setCookies = cRes?.headers.getSetCookie?.() ?? [];
  const a3 = setCookies.map((c) => c.split(";")[0]).find((c) => c.startsWith("A3="));
  if (!a3) throw new Error("yahoo: no A3 cookie issued");
  // Step 2: exchange the cookie for a crumb.
  const crumbRes = await fetch(`${YAHOO}/v1/test/getcrumb`, {
    headers: { "User-Agent": UA, Cookie: a3, Accept: "text/plain" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!crumbRes.ok) throw new Error(`yahoo: getcrumb HTTP ${crumbRes.status}`);
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.startsWith("<")) throw new Error("yahoo: empty crumb");
  crumbCache = { cookie: a3, crumb, ts: Date.now() };
  return { cookie: a3, crumb };
}

/** Fundamentals from Yahoo quoteSummary (cookie+crumb auth). Callers must handle null. */
export async function yahooSummary(ticker: string): Promise<SummaryData | null> {
  const modules = "summaryDetail,defaultKeyStatistics,financialData,assetProfile";
  let j: YahooSummary;
  try {
    const { cookie, crumb } = await yahooCrumb();
    const url = `${YAHOO}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Cookie: cookie, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      // Stale crumb or unknown ticker — retry once with a fresh crumb.
      crumbCache = null;
      const fresh = await yahooCrumb();
      const retry = await fetch(`${YAHOO}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(fresh.crumb)}`, {
        headers: { "User-Agent": UA, Cookie: fresh.cookie, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!retry.ok) throw new Error(`HTTP ${retry.status} from ${new URL(url).host}`);
      j = (await retry.json()) as YahooSummary;
    } else {
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      j = (await res.json()) as YahooSummary;
    }
  } catch {
    return null; // gated/blocked — DATA UNAVAILABLE, honest fallback
  }
  const err = j.quoteSummary?.error;
  if (err) return null;
  const r = j.quoteSummary.result?.[0];
  if (!r) return null;
  const fd = r.financialData ?? {};
  const sd = r.summaryDetail ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const val = (x?: { raw: number }) => (x && Number.isFinite(x.raw) ? x.raw : null);
  const fundamentals: Fundamentals = {
    currency: "USD",
    revenueTtm: val(fd.totalRevenue),
    ebitdaTtm: val(fd.ebitda),
    netIncomeTtm: val(fd.netIncomeToCommon),
    fcfTtm: val(fd.freeCashflow),
    grossMarginPct: val(fd.grossMargins) != null ? (val(fd.grossMargins) as number) * 100 : null,
    operatingMarginPct: val(fd.operatingMargins) != null ? (val(fd.operatingMargins) as number) * 100 : null,
    netMarginPct: val(fd.profitMargins) != null ? (val(fd.profitMargins) as number) * 100 : null,
    roicPct: null, // not directly available keyless; ROE used instead in scoring
    totalDebt: val(fd.totalDebt),
    cash: val(fd.totalCash),
    sharesOutstanding: val(ks.sharesOutstanding),
    peTtm: val(sd.trailingPE),
    forwardPe: val(sd.forwardPE),
    evEbitda: null,
    epsTtm: val(ks.trailingEps),
    beta: val(sd.beta),
    dividendYieldPct: val(sd.dividendYield) != null ? (val(sd.dividendYield) as number) * 100 : null,
    revenueGrowthYoYPct: val(fd.revenueGrowth) != null ? (val(fd.revenueGrowth) as number) * 100 : null,
    asOf: Date.now(),
    source: "yahoo:quoteSummary",
  };
  return {
    fundamentals,
    sector: r.assetProfile?.sector ?? null,
    industry: r.assetProfile?.industry ?? null,
    businessSummary: r.assetProfile?.longBusinessSummary ?? null,
    marketCap: val(sd.marketCap),
    targetMeanPrice: val(fd.targetMeanPrice),
  };
}

// ── NewsProvider ──────────────────────────────────────────────────────

export interface RawNews {
  title: string;
  link: string;
  source: string;
  publishedTs: number | null;
}

/** Google News RSS — keyless, reliable. Retrieved content is UNTRUSTED INPUT (spec §35). */
export async function googleNews(ticker: string, limit = 12): Promise<RawNews[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(ticker)}+stock&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from news.google.com`);
  const xml = await res.text();
  const items: RawNews[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && items.length < limit) {
    const block = m[1];
    const pick = (tag: string) => {
      const t = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`).exec(block);
      return t ? decodeEntities(t[1].trim()) : "";
    };
    const title = pick("title");
    if (!title) continue;
    const pub = pick("pubDate");
    const ts = pub ? Date.parse(pub) : NaN;
    items.push({
      title,
      link: pick("link"),
      source: pick("source") || "Google News",
      publishedTs: Number.isFinite(ts) ? ts : null,
    });
  }
  return items;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
}

// ── MacroProvider ─────────────────────────────────────────────────────

export interface MacroQuote {
  symbol: string;
  label: string;
  price: number | null;
  changePct: number | null;
  asOf: number | null;
  source: string;
}

const MACRO_SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^DJI", label: "Dow" },
  { symbol: "^VIX", label: "VIX" },
  { symbol: "^TNX", label: "10Y Yield" },
  { symbol: "DX-Y.NYB", label: "USD Index" },
  { symbol: "GC=F", label: "Gold" },
  { symbol: "CL=F", label: "WTI Crude" },
];

export async function macroQuotes(): Promise<MacroQuote[]> {
  const results = await Promise.allSettled(
    MACRO_SYMBOLS.map(async (s) => {
      const { quote } = await yahooChart(s.symbol, "5d", "1d");
      return {
        symbol: s.symbol,
        label: s.label,
        price: quote.price,
        changePct: quote.changePct,
        asOf: quote.asOf,
        source: "yahoo:chart",
      } satisfies MacroQuote;
    }),
  );
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { symbol: MACRO_SYMBOLS[i].symbol, label: MACRO_SYMBOLS[i].label, price: null, changePct: null, asOf: null, source: "yahoo:chart" },
  );
}

/** Sector performance via keyless sector ETFs. */
const SECTOR_ETFS: { symbol: string; label: string }[] = [
  { symbol: "XLK", label: "Technology" },
  { symbol: "XLF", label: "Financials" },
  { symbol: "XLV", label: "Health Care" },
  { symbol: "XLE", label: "Energy" },
  { symbol: "XLY", label: "Consumer Discretionary" },
  { symbol: "XLP", label: "Consumer Staples" },
  { symbol: "XLI", label: "Industrials" },
  { symbol: "XLU", label: "Utilities" },
  { symbol: "XLRE", label: "Real Estate" },
  { symbol: "XLB", label: "Materials" },
  { symbol: "XLC", label: "Communication Services" },
];

export async function sectorPerformance(): Promise<MacroQuote[]> {
  const results = await Promise.allSettled(
    SECTOR_ETFS.map(async (s) => {
      const { quote } = await yahooChart(s.symbol, "5d", "1d");
      return { symbol: s.symbol, label: s.label, price: quote.price, changePct: quote.changePct, asOf: quote.asOf, source: "yahoo:chart" } satisfies MacroQuote;
    }),
  );
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { symbol: SECTOR_ETFS[i].symbol, label: SECTOR_ETFS[i].label, price: null, changePct: null, asOf: null, source: "yahoo:chart" },
  );
}

export async function spyCloses(bars = 260): Promise<number[]> {
  const { candles } = await yahooChart("SPY", "1y", "1d");
  return candles.slice(-bars).map((c) => c.close);
}
