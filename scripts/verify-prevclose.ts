// One-off: verify today's % change uses the prior-session close. Compare
// printed values against a public quote page before trusting the UI.
import { yahooChart } from "../core/research/providers";
import { resolveCandles } from "../core/data/plugins";

async function main() {
  const symbols = ["^DJI", "^GSPC", "^IXIC", "AAPL"];
  for (const s of symbols) {
    const { quote } = await yahooChart(s, "5d", "1d");
    console.log(
      `${s.padEnd(6)} price=${quote.price?.toFixed(2)} prev=${quote.prevClose?.toFixed(2)} chg=${quote.changePct?.toFixed(2)}%`,
    );
  }
  console.log("--- chart layer (plugin path, 1D minute bars) ---");
  for (const s of ["^DJI", "AAPL"]) {
    const r = await resolveCandles(s, "1D");
    if (!r.ok) {
      console.log(`${s}: unavailable (${r.reason})`);
      continue;
    }
    const price = r.quote.price ?? r.candles[r.candles.length - 1]?.c ?? null;
    const pct = price != null && r.quote.prevClose ? (price / r.quote.prevClose - 1) * 100 : null;
    console.log(`${s.padEnd(6)} price=${price?.toFixed(2)} prev=${r.quote.prevClose?.toFixed(2)} chg=${pct?.toFixed(2)}%`);
  }
}

void main();
