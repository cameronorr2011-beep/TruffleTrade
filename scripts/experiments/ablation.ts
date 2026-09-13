/**
 * Ablation lab (walk-forward, deterministic): does each signal leg actually
 * earn its weight? Removes one leg at a time and compares directional
 * accuracy against the full model and against naive baselines on the same
 * unseen data. Costs are NOT modeled here (direction-only) — that limitation
 * is stated in the output rather than hidden.
 *
 * Run: npx tsx scripts/experiments/ablation.ts [TICKER...]
 * Dataset version: yahoo:chart daily closes at run time. Seeds fixed.
 */
import { yahooChart } from "../../core/research/providers";
import { twinConfidence, newsSentiment, macroSentiment } from "../../core/research/marketIntelligence";
import { streetRatings } from "../../core/research/providers";
import { assembleDeterministic, type SignalInputs } from "../../core/research/signal";

const TICKERS = process.argv.slice(2).length ? process.argv.slice(2) : ["AAPL", "MSFT", "NVDA", "XOM", "JPM"];
const STEP = 20; // evaluate every 20 sessions (walk-forward)
const HORIZON = 20; // outcome window

function churnScore(closes: number[]): number {
  // naive momentum baseline: 21-day return sign
  const a = closes[closes.length - 22];
  const b = closes[closes.length - 1];
  return a ? (b / a - 1) * 5 : 0;
}

function meanRevScore(closes: number[]): number {
  // naive mean-reversion baseline: negative of 5-day return
  const a = closes[closes.length - 6];
  const b = closes[closes.length - 1];
  return a ? -(b / a - 1) * 5 : 0;
}

async function inputsAt(closesAll: number[], idx: number) {
  const closes = closesAll.slice(0, idx + 1);
  if (closes.length < 210) return null;
  // Twin + street are expensive → computed once per ticker at final cut and
  // reused for the ablation shape; this is a STRUCTURE experiment (leg
  // weighting), not a live-data experiment. Stated, not hidden.
  return closes;
}

async function main() {
  console.log("══ TruffleTrade ablation lab — walk-forward, direction-only ══");
  console.log(`tickers: ${TICKERS.join(", ")} · step ${STEP}d · horizon ${HORIZON}d\n`);

  type Counter = { n: number; correct: number };
  const tally: Record<string, Counter> = {
    full: { n: 0, correct: 0 },
    no_twin: { n: 0, correct: 0 },
    no_trend: { n: 0, correct: 0 },
    no_news: { n: 0, correct: 0 },
    no_macro: { n: 0, correct: 0 },
    no_street: { n: 0, correct: 0 },
    momentum: { n: 0, correct: 0 },
    meanrev: { n: 0, correct: 0 },
  };
  let evaluations = 0;

  for (const ticker of TICKERS) {
    const { candles } = await yahooChart(ticker, "5y", "1d").catch(() => ({ candles: [] }));
    if (candles.length < 300) {
      console.log(`${ticker}: insufficient history (${candles.length} bars) — skipped`);
      continue;
    }
    const closesAll = candles.map((c) => c.close);
    const chart = await yahooChart(ticker, "1y", "1d").catch(() => null);
    const hl = chart ? chart.candles.map((c) => ({ high: c.high, low: c.low })) : null;
    const [news, macro, street] = await Promise.all([
      newsSentiment(ticker).catch(() => null),
      macroSentiment().catch(() => null),
      streetRatings(ticker).catch(() => null),
    ]);

    for (let i = 220; i < closesAll.length - HORIZON; i += STEP) {
      const closes = closesAll.slice(Math.max(0, i - 260), i + 1);
      if (closes.length < 210) continue;
      const price = closes[closes.length - 1];
      const actual = (closesAll[i + HORIZON] / price - 1) as number;
      const actualSign = actual > 0 ? 1 : -1;
      evaluations++;

      const twin = twinConfidence(ticker, closes);
      const mk = (overrides: Partial<SignalInputs>): SignalInputs => ({
        closes,
        candlesHighLow: hl?.slice(-closes.length) ?? null,
        volumes: null,
        twin,
        newsScore: news?.score ?? null,
        newsLabel: news?.label ?? null,
        macroScore: macro?.score ?? null,
        macroLabel: macro?.label ?? null,
        street: street ?? null,
        price,
        ...overrides,
      });

      const variants: Record<string, SignalInputs> = {
        full: mk({}),
        no_twin: mk({ twin: null }),
        no_trend: mk({ closes: null, candlesHighLow: null }),
        no_news: mk({ newsScore: null, newsLabel: null }),
        no_macro: mk({ macroScore: null, macroLabel: null }),
        no_street: mk({ street: null }),
      };

      for (const [name, input] of Object.entries(variants)) {
        const s = assembleDeterministic(ticker, input);
        // Direction = sign of the raw weighted score. The NO TRADE gates are
        // deliberately bypassed HERE: removing a leg trips the ≥2-missing data
        // gate (fail-closed, correct in production) which would blank the
        // experiment. This measures each leg's contribution to the signal,
        // not the gate. Abstention behavior is production's, not this lab's.
        if (s.score === 0) continue;
        const dir = Math.sign(s.score);
        tally[name].n++;
        if (dir === actualSign) tally[name].correct++;
      }
      // baselines never abstain
      for (const [name, score] of [["momentum", churnScore(closes)], ["meanrev", meanRevScore(closes)]] as const) {
        tally[name].n++;
        if (Math.sign(score) === actualSign) tally[name].correct++;
      }
    }
  }

  console.log(`\nevaluations: ${evaluations}\n`);
  console.log("variant        n    acc    vs full");
  const fullAcc = tally.full.n ? tally.full.correct / tally.full.n : 0;
  for (const [name, c] of Object.entries(tally)) {
    const acc = c.n ? c.correct / c.n : 0;
    const d = acc - fullAcc;
    console.log(
      `${name.padEnd(13)}${String(c.n).padStart(4)}  ${(acc * 100).toFixed(1)}%  ${name === "full" ? "   —" : `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}pp`}`,
    );
  }
  console.log(
    "\nReading: a leg earns its weight if removing it DROPS accuracy. If no_twin ≈ full,",
    "\nthe twin is decoration — kill it or fix it. Abstentions (NO TRADE) are excluded;",
    "\ncosts are not modeled; sample sizes are small — treat as direction, not proof.",
  );
}

void main();
