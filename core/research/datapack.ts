// Deterministic market-data assembly. Every DataPack records per-section
// availability so the UI can show DATA UNAVAILABLE instead of guessing.

import type { DataPack, NewsItem } from "./types";
import {
  googleNews,
  macroQuotes,
  spyCloses,
  streetRatings,
  yahooChart,
  yahooSummary,
} from "./providers";
import { computeTechnicals } from "./indicators";

export async function buildDataPack(ticker: string): Promise<DataPack> {
  const t = ticker.toUpperCase().trim();
  const sources: string[] = [];
  const errors: string[] = [];

  // Chart + quote — required; everything else degrades independently.
  const chart = await yahooChart(t, "1y", "1d").catch((e: Error) => {
    errors.push(`chart: ${e.message}`);
    return null;
  });
  if (chart) sources.push("yahoo:chart");

  // Fundamentals — often gated; null means DATA UNAVAILABLE, never fabricated.
  const summary = await yahooSummary(t).catch(() => null);
  if (summary) sources.push("yahoo:quoteSummary");

  // News + macro + street consensus in parallel — failures tolerated.
  const [newsRaw, macro, spy, street] = await Promise.all([
    googleNews(t, 12).catch((e: Error) => {
      errors.push(`news: ${e.message}`);
      return [] as { title: string; link: string; source: string; publishedTs: number | null }[];
    }),
    macroQuotes().catch(() => []),
    spyCloses(260).catch(() => [] as number[]),
    streetRatings(t).catch(() => null),
  ]);
  if (newsRaw.length) sources.push("googlenews:rss");
  if (macro.length) sources.push("yahoo:macro");
  if (street) sources.push("yahoo:recommendationTrend");

  const news: NewsItem[] = newsRaw.map((n) => ({
    title: n.title,
    link: n.link,
    source: n.source,
    publishedTs: n.publishedTs,
    retrievedTs: Date.now(),
  }));

  const candles = chart?.candles ?? [];
  const technicals = computeTechnicals(candles, spy);

  const quote = chart?.quote ?? {
    ticker: t,
    name: null,
    exchange: null,
    currency: "USD",
    price: null,
    prevClose: null,
    changePct: null,
    marketCap: summary?.marketCap ?? null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    asOf: null,
    source: "unavailable",
  };
  if (quote.marketCap == null && summary?.marketCap != null) quote.marketCap = summary.marketCap;

  const availability: Record<string, boolean> = {
    quote: quote.price != null,
    candles: candles.length >= 60,
    technicals: technicals.rsi14 != null,
    fundamentals: summary != null,
    news: news.length > 0,
    macro: macro.some((m) => m.changePct != null),
    relativeStrength: technicals.relStrengthVsSpy30d != null,
    street: street != null,
  };

  return {
    ticker: t,
    quote,
    candles1d: candles,
    technicals,
    fundamentals: summary?.fundamentals ?? null,
    fundamentalsError: summary ? null : "fundamentals gated or unavailable (DATA UNAVAILABLE)",
    news,
    macro,
    spyCloses: spy,
    street,
    retrievalTs: Date.now(),
    sources,
    availability,
  };
}
