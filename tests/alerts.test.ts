import { describe, expect, it, vi, beforeEach } from "vitest";
import { evaluateTicker, detectCatalysts } from "../core/alerts";
import type { CandleBar, NewsItem } from "../core/data/plugins";

// Mock the provider registry — alerts logic must be testable without network.
vi.mock("../core/data/plugins", () => ({
  resolveCandles: vi.fn(),
  resolveNews: vi.fn(),
}));

import { resolveCandles, resolveNews } from "../core/data/plugins";
const mockCandles = vi.mocked(resolveCandles);
const mockNews = vi.mocked(resolveNews);

function bars(closes: number[], vols?: number[]): CandleBar[] {
  return closes.map((c, i) => ({
    t: 1_700_000_000_000 + i * 86_400_000,
    o: i === closes.length - 1 ? closes[i - 1] * 1.05 : c, // last bar gaps +5%
    h: Math.max(c, c * 1.01),
    l: Math.min(c, c * 0.99),
    c,
    v: vols?.[i] ?? 1_000_000,
  }));
}

function newsItems(n: number, ageHours: number): NewsItem[] {
  return Array.from({ length: n }, (_, i) => ({
    title: `Headline ${i}`,
    link: "https://example.com/x",
    source: "Test",
    publishedAt: Date.now() - ageHours * 3_600_000,
    tickers: ["NVDA"],
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("evaluateTicker", () => {
  it("fires the gap alert at +5% open and stamps provider + value", async () => {
    const closes = Array.from({ length: 70 }, (_, i) => 100 + i * 0.1);
    mockCandles.mockResolvedValue({
      ok: true, provider: "yahoo", sourceUrl: "x", retrievedAt: Date.now(),
      candles: bars(closes), quote: { ticker: "NVDA" },
    });
    mockNews.mockResolvedValue({ ok: false, provider: "registry", reason: "no news plugins" });

    const r = await evaluateTicker("NVDA");
    const gap = r.alerts.find((a) => a.ruleId === "gap");
    expect(gap).toBeTruthy();
    expect(gap?.severity).toBe("warning");
    expect(gap?.provider).toBe("yahoo");
    expect(gap?.value).toBeCloseTo(5, 0);
    // news was unavailable → explicit reason, not a silent skip
    expect(r.unavailable.length).toBe(1);
  });

  it("does not fire the gap alert on an ordinary open (<3%)", async () => {
    const closes = Array.from({ length: 70 }, (_, i) => 100 + i * 0.1);
    const cs = bars(closes);
    cs[cs.length - 1] = { ...cs[cs.length - 1], o: closes[closes.length - 2] * 1.01 };
    mockCandles.mockResolvedValue({
      ok: true, provider: "yahoo", sourceUrl: "x", retrievedAt: Date.now(),
      candles: cs, quote: { ticker: "NVDA" },
    });
    mockNews.mockResolvedValue({ ok: true, provider: "gnews", sourceUrl: "x", retrievedAt: Date.now(), news: [] });

    const r = await evaluateTicker("NVDA");
    expect(r.alerts.find((a) => a.ruleId === "gap")).toBeUndefined();
    expect(r.unavailable.length).toBe(0);
  });

  it("fires the news-shock alert only when 3+ headlines land within 6h", async () => {
    const closes = Array.from({ length: 70 }, (_, i) => 100 + i * 0.1);
    const cs = bars(closes);
    cs[cs.length - 1] = { ...cs[cs.length - 1], o: closes[closes.length - 2] }; // no gap
    mockCandles.mockResolvedValue({
      ok: true, provider: "yahoo", sourceUrl: "x", retrievedAt: Date.now(), candles: cs, quote: { ticker: "X" },
    });
    mockNews.mockResolvedValue({
      ok: true, provider: "gnews", sourceUrl: "x", retrievedAt: Date.now(), news: newsItems(4, 2),
    });

    const r = await evaluateTicker("X");
    const shock = r.alerts.find((a) => a.ruleId === "news-shock");
    expect(shock).toBeTruthy();
    expect(shock?.value).toBe(4);
  });

  it("records unavailability instead of inventing alerts when all providers fail", async () => {
    mockCandles.mockResolvedValue({ ok: false, provider: "registry", reason: "yahoo: HTTP 429 | stooq: no CSV" });
    mockNews.mockResolvedValue({ ok: false, provider: "registry", reason: "gnews: HTTP 503" });

    const r = await evaluateTicker("FAKE");
    expect(r.alerts).toHaveLength(0);
    expect(r.unavailable).toHaveLength(2);
    expect(r.unavailable[0]).toContain("yahoo");
  });
});

describe("detectCatalysts", () => {
  it("extracts an earnings signal from an upcoming-events headline", async () => {
    mockNews.mockResolvedValue({
      ok: true, provider: "gnews", sourceUrl: "x", retrievedAt: Date.now(),
      news: [
        { title: "NVIDIA sets date for Q3 earnings call", link: "https://example.com/a", source: "S", publishedAt: Date.now(), tickers: ["NVDA"] },
        { title: "Mild weather lifts utility revenues", link: "https://example.com/b", source: "S", publishedAt: Date.now(), tickers: ["NVDA"] },
      ],
    });
    const out = await detectCatalysts("NVDA");
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Earnings");
    expect(out[0].link).toContain("example.com/a");
  });

  it("returns [] (not a throw) when news is unavailable", async () => {
    mockNews.mockResolvedValue({ ok: false, provider: "registry", reason: "down" });
    const out = await detectCatalysts("NVDA");
    expect(out).toEqual([]);
  });
});
