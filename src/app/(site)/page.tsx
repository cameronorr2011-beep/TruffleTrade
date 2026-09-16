import Link from "next/link";
import BuyPanel from "@/components/site/BuyPanel";
import CandleChart from "@/components/market/CandleChart";

const ANALYSTS = [
  { name: "Fundamentals", brief: "Balance sheets, margins, growth quality. Numbers first, narrative second.", tint: "#eaf1e5", ink: "#408260" },
  { name: "Valuation", brief: "DCF, reverse-DCF, peer comps — every assumption exposed, no bare fair-value promises.", tint: "#f2eddf", ink: "#a3884d" },
  { name: "Technicals", brief: "Deterministic indicators computed in code; the AI interprets them, never invents them.", tint: "#e8f0f1", ink: "#5f9aa3" },
  { name: "Macro", brief: "SPY, VIX, yields, the dollar. Regime first, chart second.", tint: "#efedf3", ink: "#8d80a8" },
  { name: "Competition", brief: "Reads the peer set: who's winning the margin war, who's losing the multiple.", tint: "#f3e9e0", ink: "#b08262" },
  { name: "News", brief: "Headlines as evidence — sourced, dated, and distrusted until verified.", tint: "#f1e7e7", ink: "#ad7c7c" },
  { name: "Chart patterns", brief: "Reads the raw OHLC series: structure, breaks, volatility contraction before expansion.", tint: "#e7eef7", ink: "#5b7fa8" },
  { name: "Scenario", brief: "Bull / base / bear cases — each with the assumption that must come true.", tint: "#eef0e7", ink: "#7a8757" },
  { name: "Backtest", brief: "Replays this exact setup over the ticker's own 3-year history. Sample sizes cited.", tint: "#f0e9f0", ink: "#8d6f8d" },
];

const FAQ = [
  {
    q: "Does TruffleTrade trade for me?",
    a: "No — by design. It analyzes charts, builds theses, predicts, and audits its own forecast accuracy. Execution stays with you at your broker. You see every side of the argument before you act.",
  },
  {
    q: "Do I need an AI API key?",
    a: "Never. The AI runs on our gateway. Your subscription includes the intelligence pipeline — you install the app, add your access code, and it works.",
  },
  {
    q: "What exactly do I get when I pay?",
    a: "Instantly: an access code that unlocks the full app for 30 days. The Windows installer downloads right on this site — install, launch, paste your key. No cloning, no build tools.",
  },
  {
    q: "What is the memory system?",
    a: "Every analysis, prediction, and outcome becomes a memory fact on your machine. A digital twin — a market simulator calibrated on real candles — trains it with synthetic experience, and optional federated learning blends anonymized insights across all installs. Nothing raw ever leaves your device.",
  },
  {
    q: "Why bitcoin and not a card?",
    a: "1,000 sats in on-chain Bitcoin means no accounts, no chargebacks, no stored payment methods, and no identity documents. Pay, get your code, run the app. Renewal is always a deliberate new payment.",
  },
  {
    q: "Is this investment advice?",
    a: "No. TruffleTrade is research software. Outputs can be wrong; forecasts are audited publicly including the misses. You are responsible for your decisions, capital, and taxes.",
  },
];

const REPO = "https://github.com/cameronorr2011-beep/TruffleTrade";
const DOWNLOAD = "/api/download/desktop";

export default function LandingPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden px-5 pb-14 pt-12 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-280px] h-[560px] w-[880px] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(closest-side, #dcead9, transparent)" }}
        />
        <div className="relative mx-auto max-w-[1280px]">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-soil-500 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[1.4px] text-forest">
                <span aria-hidden className="live-dot" style={{ width: 5, height: 5 }} />
                Live candles · Council of rivals · Memory included
              </span>
              <h1 className="mt-6 text-[clamp(2.4rem,5.4vw,4.2rem)] font-extrabold leading-[1.04] tracking-[-2.4px] text-ink">
                Less noise.
                <br />
                <span className="text-forest">More signal.</span>
              </h1>
              <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-bone-soft">
                TruffleTrade points nine rival AI analysts, a fact-checker, and a red team at any stock chart — then
                remembers what it learned. It doesn&apos;t trade for you. It makes sure you&apos;ve seen every side of
                the argument before you click the button yourself.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <a href={DOWNLOAD} className="btn-primary !px-7 !py-3.5">
                  Download TruffleTrade — free
                </a>
                <Link href="/buy" className="btn-secondary !px-7 !py-3.5">
                  Activate TruffleTrade AI — 1,000 sats/mo
                </Link>
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.8px] text-faint">
                Windows installer · app is free · AI requires an activation key
              </p>
              <dl className="mt-11 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ["9+1", "analysts incl. red team"],
                  ["100%", "claims fact-checked"],
                  ["24/7", "memory on your device"],
                  ["1,000", "sats a month"],
                ].map(([n, l]) => (
                  <div key={l} className="card px-4 py-3.5">
                    <dt className="text-[22px] font-bold tracking-[-0.8px] text-ink">{n}</dt>
                    <dd className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.8px] text-faint">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-5 rounded-[2rem] opacity-60 blur-2xl"
                style={{ background: "radial-gradient(closest-side, #dcead988, transparent)" }}
              />
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/terminal-mock.svg"
                  alt="TruffleTrade research terminal: live chart, council votes, and an audited thesis"
                  className="w-full rounded-2xl border border-soil-500 shadow-xl shadow-emerald-900/10"
                />
                <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[1.2px] text-faint">
                  and below — the real thing, running live
                </p>
              </div>
            </div>
          </div>

          {/* Live chart strip — proof the data is real */}
          <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <CandleChart ticker="NVDA" compact title="NVDA — live market candles" />
            <div className="card flex flex-col justify-between p-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[1.4px] text-faint">Right now</p>
                <p className="mt-2 text-[14px] font-bold leading-snug text-ink">
                  The workspace on this page is fed by live markets.
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-bone-soft">
                  Keyless Yahoo Finance candles, macro series, sector breadth — the same data the council reasons over.
                </p>
              </div>
              <Link href="/dashboard" className="btn-secondary mt-4 w-full">
                Open the dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Council */}
      <section id="product" className="scroll-mt-20 px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <span className="text-[10px] font-bold uppercase tracking-[1.6px] text-faint">The council</span>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.8rem,3.8vw,2.9rem)] font-extrabold leading-[1.08] tracking-[-1.6px] text-ink">
            Rivals, not yes-men
          </h2>
          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-bone-soft">
            Every analysis is a structured argument, not a chatbot answer. Nine specialists with conflicting mandates
            investigate the same chart in parallel — then defend it in front of a hostile referee.
          </p>

          {/* Simulated session — the product's look, honestly labeled */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-soil-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/council-sim-dark.svg"
              alt="Simulated council session: candlesticks with nine analyst votes and the consensus band"
              className="w-full"
            />
          </div>
          <div className="mt-11 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ANALYSTS.map((a) => (
              <article key={a.name} className="card p-6 transition-transform hover:-translate-y-0.5">
                <span
                  className="grid h-9 w-9 place-items-center rounded-[10px] text-[13px] font-bold"
                  style={{ background: a.tint, color: a.ink }}
                  aria-hidden
                >
                  {a.name[0]}
                </span>
                <h3 className="mt-4 text-[15px] font-bold tracking-[-0.3px]" style={{ color: a.ink }}>
                  {a.name}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-bone-soft">{a.brief}</p>
              </article>
            ))}
            <article className="card p-6" style={{ background: "#f7efe9", borderColor: "#ecd8cc" }}>
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#f0ded2] text-[13px] font-bold text-[#a05a42]" aria-hidden>
                R
              </span>
              <h3 className="mt-4 text-[15px] font-bold tracking-[-0.3px] text-[#a05a42]">Red team</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-bone-soft">
                A hostile risk committee paid to say no. If the evidence is too thin, no analysis is issued at all.
                Fail-closed, always.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Memory section */}
      <section className="px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[1.6px] text-faint">The memory</span>
              <h2 className="mt-4 text-[clamp(1.8rem,3.8vw,2.9rem)] font-extrabold leading-[1.08] tracking-[-1.6px] text-ink">
                It remembers.
                <br />
                <span className="text-forest">It gets better.</span>
              </h2>
              <p className="mt-5 text-[14px] leading-relaxed text-bone-soft">
                Most AI tools reset to zero every session. TruffleTrade builds a memory on your device: every prediction
                is stored and later resolved against reality, every regime observation is kept, and every analysis
                leaves behind distilled insights.
              </p>
              <ul className="mt-6 space-y-3 text-[13.5px] text-ink/85">
                {[
                  "Digital-twin trainer: thousands of simulated markets calibrated on real candles",
                  "Automatic consolidation every 6 hours — duplicates merge, stale facts decay",
                  "Federated learning across installs: hashed summaries only, never your data",
                  "Forecast audit computes directional accuracy across every matured prediction",
                ].map((f) => (
                  <li key={f} className="flex gap-3">
                    <span aria-hidden className="mt-0.5 text-forest">◆</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/memory-graph.svg"
              alt="Memory graph: outcome, regime, risk, insight, twin, prediction, federated and audit nodes"
              className="w-full rounded-2xl border border-soil-500 bg-white"
            />
          </div>
        </div>
      </section>

      {/* Open source band */}
      <section className="px-5 pb-20 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <div className="card-quiet flex flex-col items-start justify-between gap-6 p-8 md:flex-row md:items-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[1.4px] text-faint">Open source, honestly</span>
              <h3 className="mt-2 text-[24px] font-bold tracking-[-1px] text-ink">Read every line before you trust it</h3>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-bone-soft">
                The council, the fact-checker, the red team, the memory, the twin — all MIT-licensed on GitHub. A no-KYC
                product earns trust by being auditable.
              </p>
            </div>              <a href={REPO} target="_blank" rel="noreferrer" className="btn-secondary shrink-0">
              View source
            </a>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <span className="text-[10px] font-bold uppercase tracking-[1.6px] text-faint">Pricing</span>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.8rem,3.8vw,2.9rem)] font-extrabold leading-[1.08] tracking-[-1.6px] text-ink">
            One price. No KYC. Paid in sats.
          </h2>
          <div className="mt-11 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            <article className="card border-forest/25 p-8" style={{ boxShadow: "0 4px 24px rgba(33,88,62,0.08)" }}>
              <span className="text-[10px] font-bold uppercase tracking-[1.4px] text-forest">TruffleTrade</span>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-[52px] font-extrabold leading-none tracking-[-2px] text-ink">1,000</span>
                <span className="text-[12px] font-semibold uppercase tracking-[0.8px] text-bone-soft">sats / 30 days</span>
              </div>
              <ul className="mt-6 space-y-3 text-[13.5px] text-ink/85">
                {[
                  "Live candlestick dashboard + real-time news, free tier included",
                  "Nine-analyst council + historical backtester + red team",
                  "Desktop app for Windows — pin it, launch it, it's yours",
                  "Local memory system with automatic updates",
                  "Federated learning from every installation",
                  "No KYC — pay from any Bitcoin wallet",
                ].map((f) => (
                  <li key={f} className="flex gap-3">
                    <span aria-hidden className="mt-0.5 text-forest">◆</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/buy" className="btn-primary mt-8 inline-block">
Pay with Bitcoin
              </Link>
              <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.8px] text-faint">
                30-day access · no auto-renew · pay again when you want
              </p>
            </article>
            <BuyPanel />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-[900px]">
          <span className="text-[10px] font-bold uppercase tracking-[1.6px] text-faint">FAQ</span>
          <h2 className="mt-4 text-[clamp(1.8rem,3.6vw,2.8rem)] font-extrabold leading-[1.08] tracking-[-1.6px] text-ink">
            Straight answers
          </h2>
          <div className="mt-9 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="card group p-5">
                <summary className="cursor-pointer list-none text-[15px] font-bold text-ink marker:hidden">
                  <span className="mr-3 inline-block text-forest transition-transform group-open:rotate-90">→</span>
                  {f.q}
                </summary>
                <p className="mt-3 pl-8 text-[13px] leading-relaxed text-bone-soft">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-10 max-w-3xl rounded-xl border border-soil-500 bg-white p-5 text-[12.5px] leading-relaxed text-bone-soft">
            <strong className="font-bold text-ink">Honest disclaimer:</strong> TruffleTrade produces research and
            analysis — it does not execute trades and is not investment advice. You must be 18+, or 13–17 with parental
            consent and supervision. See the{" "}
            <Link href="/terms" className="font-semibold text-forest underline decoration-forest/40 underline-offset-2">
              Terms
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
