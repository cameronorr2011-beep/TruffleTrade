// TruffleTrade data provider registry — the no-KYC plugin layer.
//
// Every market/news feed is a DataPlugin: keyed, typed, keyless (no API keys,
// no accounts, no identity), returning normalized payloads with provenance.
// A plugin that fails returns an explicit UNAVAILABLE — data is never
// invented, never substituted silently. Failover order is registry order.
//
// Adding a provider = appending one entry. Nothing else changes.

export type PluginKind = "candles" | "quote" | "news";

export interface Provenance {
  provider: string; // plugin id, e.g. "kraken"
  retrievedAt: number; // ms epoch of this fetch
  sourceUrl: string; // public endpoint (no secrets)
}

export interface CandleBar {
  t: number; // ms epoch
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export interface Quote {
  ticker: string;
  price: number;
  prevClose: number | null;
  currency: string | null;
  name: string | null;
  exchange: string | null;
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: number; // ms epoch
  tickers: string[];
}

/** Explicit unavailability — replaces the data, never fakes it. */
export type Unavailable = { ok: false; provider: string; reason: string };
/** Successful results carry provenance at the top level. */
export type PluginResult<T> = ({ ok: true } & Provenance & T) | Unavailable;

export interface DataPlugin {
  id: string; // "kraken" | "yahoo" | ...
  label: string; // human-readable
  kinds: PluginKind[];
  /** No-account, no-API-key public endpoint — enforced by policy, asserted here. */
  keyless: true;
  regions: string[]; // rough coverage hint for docs/UX, e.g. ["us"], ["crypto"], ["global"]
  candles?: (ticker: string, range: string) => Promise<{ candles: CandleBar[]; quote: Partial<Quote> }>;
  quote?: (ticker: string) => Promise<Partial<Quote>>;
  news?: (ticker: string, limit: number) => Promise<NewsItem[]>;
}

const UA = "TruffleTrade/1.0 (no-kyc research terminal)";

async function getJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json,text/xml,*/*" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

async function getText(url: string, timeoutMs = 12_000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/xml,application/xml,*/*" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return await res.text();
}

// ── kraken ────────────────────────────────────────────────────────────────
// Public REST, no key, no account. Crypto-first coverage; cash symbols are
// mapped to the closest crypto pairs (AAPL/SPY have none and return nothing).

const KRAKEN_REST = "https://api.kraken.com/0/public";
const KRAKEN_PAIRS: Record<string, string> = {
  BTC: "XBTUSD",
  XBT: "XBTUSD",
  ETH: "ETHUSD",
  SOL: "SOLUSD",
  XRP: "XRPUSD",
  DOGE: "XDGUSD",
  ADA: "ADAUSD",
  LTC: "LTCUSD",
  LINK: "LINKUSD",
  AVAX: "AVAXUSD",
};
const KRAKEN_INTERVAL_MIN: Record<string, number> = {
  "1D": 1,
  "1W": 5,
  "1M": 60,
  "6M": 720,
  "1Y": 1440,
  "5Y": 10080,
};

function krakenPair(ticker: string): string | null {
  return KRAKEN_PAIRS[ticker.toUpperCase()] ?? null;
}

const kraken: DataPlugin = {
  id: "kraken",
  label: "Kraken (public REST)",
  kinds: ["candles", "quote"],
  keyless: true,
  regions: ["crypto"],
  async candles(ticker, range) {
    const pair = krakenPair(ticker);
    if (!pair) throw new Error(`no Kraken pair for ${ticker}`);
    const interval = KRAKEN_INTERVAL_MIN[range] ?? 60;
    type Ohlc = { error: string[]; result: Record<string, (number | string)[][]> };
    const j = await getJson<Ohlc>(`${KRAKEN_REST}/OHLC?pair=${pair}&interval=${interval}`);
    if (j.error?.length) throw new Error(`Kraken: ${j.error.join("; ")}`);
    const key = Object.keys(j.result).find((k) => k !== "last");
    const rows = key ? j.result[key] : [];
    const candles: CandleBar[] = rows.map((r) => ({
      t: Number(r[0]) * 1000,
      o: Number(r[1]),
      h: Number(r[2]),
      l: Number(r[3]),
      c: Number(r[4]),
      v: Number(r[6]),
    }));
    const last = candles[candles.length - 1];
    return {
      candles,
      quote: last
        ? { ticker, price: last.c, currency: "USD", name: `${ticker}/USD`, exchange: "Kraken" }
        : { ticker },
    };
  },
  async quote(ticker) {
    const pair = krakenPair(ticker);
    if (!pair) throw new Error(`no Kraken pair for ${ticker}`);
    type Tick = { result: Record<string, { c: string[] }> };
    const j = await getJson<Tick>(`${KRAKEN_REST}/Ticker?pair=${pair}`);
    const row = Object.values(j.result)[0];
    if (!row?.c?.[0]) throw new Error("Kraken: empty ticker");
    return { ticker, price: Number(row.c[0]), currency: "USD", name: `${ticker}/USD`, exchange: "Kraken" };
  },
};

// ── yahoo ─────────────────────────────────────────────────────────────────
// Public v8 chart endpoint, keyless. Primary for cash equities/ETFs.
// Delegates to the battle-tested providers module for parsing.

const YAHOO_REST = "https://query1.finance.yahoo.com";

const YAHOO_RANGE: Record<string, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "1m" },
  "1W": { range: "5d", interval: "5m" },
  "1M": { range: "1mo", interval: "1h" },
  "6M": { range: "6mo", interval: "1h" },
  "1Y": { range: "1y", interval: "1d" },
  "5Y": { range: "5y", interval: "1wk" },
};

function looksLikeCashTicker(ticker: string): boolean {
  // Equities/ETFs/indices: letters (+ optional .X / -X suffixes, ^ indices, = futures).
  return /^[A-Z]{1,6}(\.[A-Z]{1,3})?([\-=][A-Z0-9]{1,3})?$/.test(ticker) || ticker.startsWith("^");
}

const yahoo: DataPlugin = {
  id: "yahoo",
  label: "Yahoo Finance (public v8)",
  kinds: ["candles", "quote"],
  keyless: true,
  regions: ["us", "global"],
  async candles(ticker, range) {
    if (!looksLikeCashTicker(ticker)) throw new Error(`no Yahoo symbol for ${ticker}`);
    const r = YAHOO_RANGE[range] ?? YAHOO_RANGE["1M"];
    type Chart = {
      chart: {
        result: {
          meta: {
            regularMarketPrice: number;
            chartPreviousClose: number;
            currency: string;
            shortName?: string;
            exchangeName?: string;
          };
          timestamp: number[];
          indicators: { quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }[] };
        }[];
      };
    };
    const j = await getJson<Chart>(
      `${YAHOO_REST}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${r.range}&interval=${r.interval}&includePrePost=false`,
    );
    const res = j.chart.result?.[0];
    if (!res) throw new Error("Yahoo: empty chart");
    const q = res.indicators.quote[0];
    const candles: CandleBar[] = [];
    for (let i = 0; i < res.timestamp.length; i++) {
      const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({ t: res.timestamp[i] * 1000, o, h, l, c, v: q.volume[i] ?? null });
    }
    if (candles.length === 0) throw new Error("Yahoo: no candles");
    return {
      candles,
      quote: {
        ticker,
        price: res.meta.regularMarketPrice,
        prevClose: res.meta.chartPreviousClose ?? null,
        currency: res.meta.currency ?? null,
        name: res.meta.shortName ?? null,
        exchange: res.meta.exchangeName ?? null,
      },
    };
  },
  async quote(ticker) {
    if (!looksLikeCashTicker(ticker)) throw new Error(`no Yahoo symbol for ${ticker}`);
    type Chart = { chart: { result: { meta: { regularMarketPrice: number; chartPreviousClose: number; currency: string; shortName?: string; exchangeName?: string } }[] } };
    const j = await getJson<Chart>(
      `${YAHOO_REST}/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`,
    );
    const meta = j.chart.result?.[0]?.meta;
    if (!meta) throw new Error("Yahoo: empty meta");
    return {
      ticker,
      price: meta.regularMarketPrice,
      prevClose: meta.chartPreviousClose ?? null,
      currency: meta.currency ?? null,
      name: meta.shortName ?? null,
      exchange: meta.exchangeName ?? null,
    };
  },
};

// ── stooq ─────────────────────────────────────────────────────────────────
// Keyless CSV endpoint (stooq.com). Daily bars only — used as the equity
// fallback when Yahoo fails, and for symbols Yahoo drops (some non-US names).

const stooq: DataPlugin = {
  id: "stooq",
  label: "Stooq (public CSV)",
  kinds: ["candles", "quote"],
  keyless: true,
  regions: ["us", "eu"],
  async candles(ticker, _range) {
    if (!looksLikeCashTicker(ticker)) throw new Error(`no Stooq symbol for ${ticker}`);
    const sym = ticker.toLowerCase();
    const csv = await getText(`https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}.us&i=d`);
    const lines = csv.trim().split("\n");
    if (lines.length < 2 || !lines[0].startsWith("Date")) throw new Error("Stooq: no CSV data");
    const candles: CandleBar[] = [];
    for (let i = 1; i < lines.length; i++) {
      const [d, o, h, l, c, v] = lines[i].split(",");
      const t = Date.parse(`${d}T00:00:00Z`);
      const co = Number(o), ch = Number(h), cl = Number(l), cc = Number(c);
      if (!Number.isFinite(t) || !Number.isFinite(cc) || cc <= 0) continue;
      candles.push({ t, o: co, h: ch, l: cl, c: cc, v: v && Number.isFinite(Number(v)) ? Number(v) : null });
    }
    if (candles.length === 0) throw new Error("Stooq: no parsed rows");
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    return {
      candles,
      quote: { ticker, price: last.c, prevClose: prev?.c ?? null, currency: "USD", name: ticker, exchange: "Stooq" },
    };
  },
  async quote(ticker) {
    const r = await stooq.candles?.(ticker, "1M");
    if (!r || r.candles.length === 0) throw new Error("Stooq: unavailable");
    const last = r.candles[r.candles.length - 1];
    const prev = r.candles[r.candles.length - 2];
    return { ticker, price: last.c, prevClose: prev?.c ?? null, currency: "USD", name: ticker, exchange: "Stooq" };
  },
};

// ── gnews ─────────────────────────────────────────────────────────────────
// Google News RSS — keyless headlines. (Kept as its own plugin so a future
// second news source can join the failover list.)

function parseRssItems(xml: string, limit: number, fallbackSource: string): { title: string; link: string; source: string; publishedAt: number }[] {
  const items: { title: string; link: string; source: string; publishedAt: number }[] = [];
  const blocks = xml.split(/<item>/).slice(1);
  for (const b of blocks) {
    const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(b)?.[1]?.trim();
    let link = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/.exec(b)?.[1]?.trim() ?? "";
    const src = /<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/.exec(b)?.[1]?.trim() ?? fallbackSource;
    const pub = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(b)?.[1]?.trim();
    if (!title) continue;
    if (link.startsWith("http")) {
      const url = new URL(link);
      url.search = "";
      link = url.toString();
    }
    items.push({ title, link, source: src, publishedAt: pub ? Date.parse(pub) || Date.now() : Date.now() });
    if (items.length >= limit) break;
  }
  return items;
}

const gnews: DataPlugin = {
  id: "gnews",
  label: "Google News (RSS)",
  kinds: ["news"],
  keyless: true,
  regions: ["global"],
  async news(ticker, limit) {
    const xml = await getText(
      `https://news.google.com/rss/search?q=${encodeURIComponent(`${ticker} stock OR shares OR earnings`)}&hl=en-US&gl=US&ceid=US:en`,
    );
    const items = parseRssItems(xml, limit, "Google News");
    if (items.length === 0) throw new Error("Google News: no items");
    return items.map((i) => ({ ...i, tickers: [ticker] }));
  },
};

// ── the registry ──────────────────────────────────────────────────────────

export const PLUGINS: DataPlugin[] = [kraken, yahoo, stooq, gnews];

export function pluginsFor(kind: PluginKind): DataPlugin[] {
  return PLUGINS.filter((p) => p.kinds.includes(kind));
}

export function pluginCatalog(): { id: string; label: string; kinds: PluginKind[]; regions: string[]; keyless: true }[] {
  return PLUGINS.map((p) => ({ id: p.id, label: p.label, kinds: p.kinds, regions: p.regions, keyless: p.keyless }));
}

/** Walk the failover chain; every failure is an explicit unavailable reason. */
export async function resolveCandles(
  ticker: string,
  range: string,
): Promise<PluginResult<{ candles: CandleBar[]; quote: Partial<Quote> }>> {
  const attempts: string[] = [];
  for (const p of pluginsFor("candles")) {
    try {
      if (!p.candles) continue;
      const r = await p.candles(ticker, range);
      return { ok: true, provider: p.id, sourceUrl: pluginEndpoint(p.id), retrievedAt: Date.now(), ...r };
    } catch (e) {
      attempts.push(`${p.id}: ${(e as Error).message}`);
    }
  }
  return { ok: false, provider: "registry", reason: attempts.join(" | ") || "no candle plugins" };
}

export async function resolveQuote(ticker: string): Promise<PluginResult<{ quote: Quote }>> {
  const attempts: string[] = [];
  for (const p of pluginsFor("quote")) {
    try {
      if (!p.quote) continue;
      const partial = await p.quote(ticker);
      if (partial.price == null || !Number.isFinite(partial.price)) throw new Error("no price");
      return {
        ok: true,
        provider: p.id,
        sourceUrl: pluginEndpoint(p.id),
        retrievedAt: Date.now(),
        quote: {
          ticker,
          price: partial.price,
          prevClose: partial.prevClose ?? null,
          currency: partial.currency ?? null,
          name: partial.name ?? null,
          exchange: partial.exchange ?? null,
        },
      };
    } catch (e) {
      attempts.push(`${p.id}: ${(e as Error).message}`);
    }
  }
  return { ok: false, provider: "registry", reason: attempts.join(" | ") || "no quote plugins" };
}

export async function resolveNews(ticker: string, limit = 12): Promise<PluginResult<{ news: NewsItem[] }>> {
  const attempts: string[] = [];
  for (const p of pluginsFor("news")) {
    try {
      if (!p.news) continue;
      const news = await p.news(ticker, limit);
      return { ok: true, provider: p.id, sourceUrl: pluginEndpoint(p.id), retrievedAt: Date.now(), news };
    } catch (e) {
      attempts.push(`${p.id}: ${(e as Error).message}`);
    }
  }
  return { ok: false, provider: "registry", reason: attempts.join(" | ") || "no news plugins" };
}

function pluginEndpoint(id: string): string {
  switch (id) {
    case "kraken": return "https://api.kraken.com/0/public";
    case "yahoo": return "https://query1.finance.yahoo.com/v8/finance/chart";
    case "stooq": return "https://stooq.com/q/d/l/";
    case "gnews": return "https://news.google.com/rss";
    default: return "unknown";
  }
}
