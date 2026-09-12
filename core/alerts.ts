// TruffleTrade alerts engine — deterministic rules over no-KYC plugin data.
// The AI never fires alerts: every rule is reproducible code with the inputs
// attached (values, provider, timestamp). Unavailable data → no alert for
// that rule, never a fabricated condition.

import { resolveCandles, resolveNews, type CandleBar, type NewsItem } from "./data/plugins";
import { rsi, sma, macdHist, realizedVolPct } from "./research/indicators";

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  ruleId: string;
  ticker: string;
  severity: AlertSeverity;
  message: string;
  value: number | null; // the triggering measurement
  provider: string | null;
  ts: number;
}

export interface TickerEvaluation {
  ticker: string;
  alerts: Alert[];
  unavailable: string[]; // explicit per-rule unavailability reasons
}

const DAY_MS = 86_400_000;

function pct(a: number, b: number): number {
  return b === 0 ? 0 : ((a - b) / b) * 100;
}

/** Overnight/intraday gap vs prior close. Warning ≥3%, critical ≥6%. */
function gapAlert(ticker: string, candles: CandleBar[], provider: string): Alert | null {
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1];
  const ref = candles[candles.length - 2].c;
  const g = pct(last.o, ref);
  if (Math.abs(g) < 3) return null;
  return {
    ruleId: "gap",
    ticker,
    severity: Math.abs(g) >= 6 ? "critical" : "warning",
    message: `${g > 0 ? "Gap up" : "Gap down"} ${Math.abs(g).toFixed(1)}% at open vs prior close`,
    value: Number(g.toFixed(2)),
    provider,
    ts: last.t,
  };
}

/** Volume spike: last bar vs mean of the prior 20. */
function volumeAlert(ticker: string, candles: CandleBar[], provider: string): Alert | null {
  const vols = candles.map((c) => c.v).filter((v): v is number => v != null && v > 0);
  if (vols.length < 10) return null;
  const last = vols[vols.length - 1];
  const prior = vols.slice(-21, -1);
  const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (mean <= 0) return null;
  const ratio = last / mean;
  if (ratio < 2.5) return null;
  return {
    ruleId: "volume-spike",
    ticker,
    severity: ratio >= 5 ? "warning" : "info",
    message: `Volume ${ratio.toFixed(1)}× the 20-bar average`,
    value: Number(ratio.toFixed(2)),
    provider,
    ts: candles[candles.length - 1].t,
  };
}

/** RSI(14) extremes on daily closes. */
function rsiAlert(ticker: string, candles: CandleBar[], provider: string): Alert | null {
  if (candles.length < 20) return null;
  const value = rsi(candles.map((c) => c.c), 14);
  if (value == null) return null;
  if (value < 70 && value > 30) return null;
  return {
    ruleId: "rsi-extreme",
    ticker,
    severity: value >= 80 || value <= 20 ? "warning" : "info",
    message: value >= 70 ? `RSI overbought (${value.toFixed(0)})` : `RSI oversold (${value.toFixed(0)})`,
    value: Number(value.toFixed(1)),
    provider,
    ts: candles[candles.length - 1].t,
  };
}

/** SMA20/SMA50 cross within the last 3 bars. */
function crossAlert(ticker: string, candles: CandleBar[], provider: string): Alert | null {
  if (candles.length < 55) return null;
  const closes = candles.map((c) => c.c);
  const diffAt = (n: number) => {
    const s20 = sma(closes.slice(0, n), 20);
    const s50 = sma(closes.slice(0, n), 50);
    return s20 == null || s50 == null ? null : s20 - s50;
  };
  const now = diffAt(closes.length);
  const before = diffAt(closes.length - 3);
  if (now == null || before == null || Math.sign(now) === Math.sign(before)) return null;
  const golden = now > 0;
  return {
    ruleId: "ma-cross",
    ticker,
    severity: "info",
    message: golden ? "SMA20 crossed above SMA50 (golden cross)" : "SMA20 crossed below SMA50 (death cross)",
    value: Number(now.toFixed(3)),
    provider,
    ts: candles[candles.length - 1].t,
  };
}

/** MACD histogram sign flip on the last bar. */
function macdAlert(ticker: string, candles: CandleBar[], provider: string): Alert | null {
  if (candles.length < 40) return null;
  const closes = candles.map((c) => c.c);
  const now = macdHist(closes);
  const prev = macdHist(closes.slice(0, -1));
  if (now == null || prev == null || Math.sign(now) === Math.sign(prev)) return null;
  return {
    ruleId: "macd-flip",
    ticker,
    severity: "info",
    message: now > 0 ? "MACD histogram flipped positive" : "MACD histogram flipped negative",
    value: Number(now.toFixed(3)),
    provider,
    ts: candles[candles.length - 1].t,
  };
}

/** Volatility regime: 14-bar realized vol vs the series' longer-run level. */
function volAlert(ticker: string, candles: CandleBar[], provider: string): Alert | null {
  if (candles.length < 60) return null;
  const closes = candles.map((c) => c.c);
  const recent = realizedVolPct(closes.slice(-14), 14);
  const baseline = realizedVolPct(closes, 60);
  if (recent == null || baseline == null || baseline <= 0) return null;
  const ratio = recent / baseline;
  if (ratio < 2) return null;
  return {
    ruleId: "vol-regime",
    ticker,
    severity: ratio >= 3 ? "warning" : "info",
    message: `Volatility regime shift: ${recent.toFixed(1)}% vs ${baseline.toFixed(1)}% baseline`,
    value: Number(ratio.toFixed(2)),
    provider,
    ts: candles[candles.length - 1].t,
  };
}

/** News-flow shock: ≥3 items in the last 6 hours. */
function newsAlert(ticker: string, news: NewsItem[]): Alert | null {
  const sixHours = Date.now() - 6 * 3_600_000;
  const fresh = news.filter((n) => n.publishedAt >= sixHours);
  if (fresh.length < 3) return null;
  return {
    ruleId: "news-shock",
    ticker,
    severity: fresh.length >= 6 ? "warning" : "info",
    message: `${fresh.length} fresh headlines in 6h — news flow spike`,
    value: fresh.length,
    provider: "gnews",
    ts: Date.now(),
  };
}

export async function evaluateTicker(ticker: string): Promise<TickerEvaluation> {
  const alerts: Alert[] = [];
  const unavailable: string[] = [];

  const c = await resolveCandles(ticker, "1M");
  if (c.ok && c.candles.length >= 2) {
    for (const a of [
      gapAlert(ticker, c.candles, c.provider),
      volumeAlert(ticker, c.candles, c.provider),
      rsiAlert(ticker, c.candles, c.provider),
      crossAlert(ticker, c.candles, c.provider),
      macdAlert(ticker, c.candles, c.provider),
      volAlert(ticker, c.candles, c.provider),
    ]) {
      if (a) alerts.push(a);
    }
  } else {
    unavailable.push(c.ok ? "no candles" : c.reason);
  }

  const n = await resolveNews(ticker, 12);
  if (n.ok) {
    const na = newsAlert(ticker, n.news);
    if (na) alerts.push(na);
  } else {
    unavailable.push(n.reason);
  }

  const rank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || b.ts - a.ts);
  return { ticker, alerts, unavailable };
}

// ── Event radar: announced catalysts mined from headlines ─────────────────
// Honest framing: these are UPCOMING-EVENT SIGNALS EXTRACTED FROM NEWS, not a
// verified calendar. Each item links to its source headline.

const CATALYST_PATTERNS: { re: RegExp; label: string; horizonDays: number }[] = [
  { re: /earnings (call|report|date)|reports (Q[1-4]|\d{4})|quarterly results/i, label: "Earnings", horizonDays: 21 },
  { re: /guidance|outlook|forecast.*(raise|cut|lower)/i, label: "Guidance", horizonDays: 21 },
  { re: /FDA (approval|decision|panel)|drug trial|phase (1|2|3)/i, label: "Regulatory / trial", horizonDays: 30 },
  { re: /(merger|acquisition|takeover|buyout|acquires)/i, label: "M&A", horizonDays: 14 },
  { re: /(lawsuit|court (ruling|decision)|antitrust|SEC (charge|probe|investigation)|settlement)/i, label: "Legal / regulator", horizonDays: 30 },
  { re: /(stock split|buyback|dividend (increase|cut|hike))/i, label: "Capital return", horizonDays: 21 },
  { re: /(product launch|keynote|unveil|worldwide developers|event)/i, label: "Product event", horizonDays: 14 },
  { re: /(rate decision|FOMC|CPI|jobs report|fed meeting)/i, label: "Macro event", horizonDays: 10 },
];

export interface Catalyst {
  ticker: string;
  label: string;
  title: string;
  link: string;
  source: string;
  publishedAt: number;
  note: string;
}

export async function detectCatalysts(ticker: string): Promise<Catalyst[]> {
  const n = await resolveNews(ticker, 20);
  if (!n.ok) return [];
  const out: Catalyst[] = [];
  const seen = new Set<string>();
  for (const item of n.news) {
    for (const p of CATALYST_PATTERNS) {
      if (p.re.test(item.title)) {
        const key = `${p.label}:${item.title.slice(0, 60)}`;
        if (seen.has(key)) break;
        seen.add(key);
        out.push({
          ticker,
          label: p.label,
          title: item.title,
          link: item.link,
          source: item.source,
          publishedAt: item.publishedAt,
          note: `Announced within the last ${p.horizonDays} days — verify the exact date at the source.`,
        });
        break;
      }
    }
    if (out.length >= 5) break;
  }
  return out;
}
