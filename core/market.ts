import type { Candle, MacroContext, MarketSnapshot } from "./types";
import { buildFeatures, pearson, realizedVolPct } from "./indicators";

const KRAKEN_REST = "https://api.kraken.com/0/public";
const COINBASE_REST = "https://api.exchange.coinbase.com";
const YAHOO_REST = "https://query1.finance.yahoo.com";

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "WOLFPIT/1.0 (autonomous trading desk)", ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

export async function krakenOhlc(intervalMinutes = 60): Promise<Candle[]> {
  type KrakenOhlc = { error: string[]; result: Record<string, (number | string)[][]> };
  const j = await getJson<KrakenOhlc>(`${KRAKEN_REST}/OHLC?pair=XBTUSD&interval=${intervalMinutes}`);
  if (j.error?.length) throw new Error(`Kraken: ${j.error.join("; ")}`);
  const key = Object.keys(j.result).find((k) => k !== "last");
  if (!key) throw new Error("Kraken: empty result");
  return j.result[key].map((r) => ({
    ts: Number(r[0]) * 1000,
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[6]),
    vwap: Number(r[7]),
  }));
}

export async function coinbaseCandles(granularitySeconds = 3600): Promise<Candle[]> {
  type CbCandle = [number, number, number, number, number, number];
  const j = await getJson<CbCandle[]>(
    `${COINBASE_REST}/products/BTC-USD/candles?granularity=${granularitySeconds}`,
  );
  return j
    .map((r) => ({
      ts: r[0] * 1000,
      low: r[1],
      high: r[2],
      open: r[3],
      close: r[4],
      volume: r[5],
    }))
    .sort((a, b) => a.ts - b.ts);
}

export async function btcPrice(): Promise<{ price: number; source: string }> {
  try {
    const j = await getJson<{ result: { XXBTZUSD: { c: string[] } } }>(`${KRAKEN_REST}/Ticker?pair=XBTUSD`);
    return { price: Number(j.result.XXBTZUSD.c[0]), source: "kraken" };
  } catch {
    const j = await getJson<{ price: number }>(`${COINBASE_REST}/products/BTC-USD/ticker`);
    return { price: j.price, source: "coinbase" };
  }
}

export async function yahooQuote(symbol: string): Promise<{ price: number; prevClose: number }> {
  type YahooChart = {
    chart: { result: { meta: { regularMarketPrice: number; chartPreviousClose: number } }[] };
  };
  const j = await getJson<YahooChart>(
    `${YAHOO_REST}/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
  );
  const meta = j.chart.result[0].meta;
  return { price: meta.regularMarketPrice, prevClose: meta.chartPreviousClose };
}

export async function yahooCloses(symbol: string, bars = 30): Promise<number[]> {
  type YahooChart = {
    chart: { result: { timestamp: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] };
  };
  const j = await getJson<YahooChart>(
    `${YAHOO_REST}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`,
  );
  const r = j.chart.result[0];
  return r.indicators.quote[0].close
    .map((c, i) => ({ c, t: r.timestamp[i] }))
    .filter((x) => x.c != null)
    .slice(-bars)
    .map((x) => x.c as number);
}

export async function macroContext(btcDaily: Candle[]): Promise<MacroContext> {
  const empty: MacroContext = {
    spy: { symbol: "SPY", price: 0, changePct: 0 },
    vixy: { symbol: "VIXY", price: 0, changePct: 0 },
    dxy: { symbol: "DX-Y.NYB", price: 0, changePct: 0 },
    riskOn: true,
    btcSpyCorrelation: null,
  };
  try {
    const [spy, vixy, dxy] = await Promise.all([
      yahooQuote("SPY"),
      yahooQuote("VIXY"),
      yahooQuote("DX-Y.NYB"),
    ]);
    const pct = (q: { price: number; prevClose: number }) =>
      q.prevClose ? (q.price / q.prevClose - 1) * 100 : 0;
    const spyCloses = await yahooCloses("SPY", 30).catch(() => [] as number[]);
    const btcCloses = btcDaily.map((c) => c.close);
    const corr = spyCloses.length >= 10 && btcCloses.length >= 10
      ? pearson(spyCloses, btcCloses)
      : null;
    const macro = {
      spy: { symbol: "SPY", price: spy.price, changePct: pct(spy) },
      vixy: { symbol: "VIXY", price: vixy.price, changePct: pct(vixy) },
      dxy: { symbol: "DX-Y.NYB", price: dxy.price, changePct: pct(dxy) },
      riskOn: pct(spy) > -0.5 && pct(vixy) < 2,
      btcSpyCorrelation: corr,
    };
    return macro;
  } catch {
    return empty;
  }
}

export async function marketSnapshot(): Promise<MarketSnapshot> {
  const sources: string[] = [];
  let candles1h: Candle[];
  let candles1d: Candle[];

  try {
    candles1h = await krakenOhlc(60);
    sources.push("kraken:1h");
  } catch {
    candles1h = await coinbaseCandles(3600);
    sources.push("coinbase:1h");
  }
  try {
    candles1d = await krakenOhlc(1440);
    sources.push("kraken:1d");
  } catch {
    candles1d = await coinbaseCandles(86_400);
    sources.push("coinbase:1d");
  }
  if (candles1d.length < 10) {
    // degrade gracefully: synthesize daily from hourly
    candles1d = candles1h.filter((_, i) => (candles1h.length - i) % 24 === 0);
  }

  const closes1h = candles1h.map((c) => c.close);
  const closes1d = candles1d.map((c) => c.close);
  const tick = await btcPrice();
  sources.push(tick.source + ":ticker");
  const macro = await macroContext(candles1d);

  return {
    ts: Date.now(),
    btcPrice: tick.price,
    candles1h,
    candles1d,
    realizedVol1hPct: realizedVolPct(closes1h, 24),
    realizedVol1dPct: realizedVolPct(closes1d, 14),
    featurePack: buildFeatures(candles1h, candles1d),
    macro,
    sources,
  };
}
