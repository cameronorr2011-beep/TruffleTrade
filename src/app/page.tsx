import Link from "next/link";
import BuyPanel from "@/components/site/BuyPanel";

const ANALYSTS = [
  { name: "FUNDAMENTALS", brief: "Balance sheets, margins, growth quality. Numbers first, narrative second.", color: "#f5c26b" },
  { name: "VALUATION", brief: "DCF, reverse-DCF, peer comps — every assumption exposed, no bare fair-value promises.", color: "#d9903c" },
  { name: "TECHNICALS", brief: "Deterministic indicators computed in code; the AI interprets them, never invents them.", color: "#e8ae52" },
  { name: "MACRO", brief: "SPY, VIX, yields, the dollar. Regime first, chart second.", color: "#f8d795" },
  { name: "COMPETITION", brief: "Reads the peer set: who's winning the margin war, who's losing the multiple.", color: "#b98434" },
  { name: "NEWS", brief: "Headlines as evidence — sourced, dated, and distrusted until verified.", color: "#9c7a4a" },
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
    a: "Instantly: an access code that unlocks the full app for 30 days. The app itself is open source — you install it from GitHub in about two minutes with the steps shown right after payment.",
  },
  {
    q: "What is the memory system?",
    a: "Every analysis, prediction, and outcome becomes a memory fact on your machine. A digital twin — a market simulator calibrated on real candles — trains it with synthetic experience, and optional federated learning blends anonymized insights across all installs. Nothing raw ever leaves your device.",
  },
  {
    q: "Why bitcoin and not a card?",
    a: "1,000 sats over Lightning means no accounts, no chargebacks, no stored payment methods, and no identity documents. Pay, get your code, run the app. Renewal is always a deliberate new payment.",
  },
  {
    q: "Is this investment advice?",
    a: "No. TruffleTrade is research software. Outputs can be wrong; forecasts are audited publicly including the misses. You are responsible for your decisions, capital, and taxes.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden px-5 pb-16 pt-16 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-320px] h-[640px] w-[900px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(closest-side, #57452f, transparent)" }}
        />
        <div className="relative mx-auto max-w-[1280px]">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/80">
                AI chart intelligence · Council of rivals · Memory included
              </span>
              <h1 className="font-display mt-6 text-[clamp(2.6rem,6vw,4.8rem)] font-semibold leading-[1.02] tracking-[-0.02em] text-bone">
                The market buries signal.
                <br />
                <span className="text-truffle-400">We dig it up.</span>
              </h1>
              <p className="mt-7 max-w-xl text-[1.05rem] leading-relaxed text-bone/60">
                TruffleTrade points six rival AI analysts, a fact-checker, and a red team at any stock chart — then
                remembers what it learned. It doesn&apos;t trade for you. It makes sure you&apos;ve seen every side of
                the argument before you click the button yourself.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Link
                  href="/buy"
                  className="rounded-full bg-truffle-500 px-7 py-3.5 font-mono text-[0.72rem] uppercase tracking-[0.22em] text-void transition-colors hover:bg-truffle-400"
                >
                  Get access — 1,000 sats/mo
                </Link>
                <Link
                  href="/install"
                  className="rounded-full border border-bone/25 px-7 py-3.5 font-mono text-[0.72rem] uppercase tracking-[0.22em] text-bone/75 transition-colors hover:border-truffle-400/50 hover:text-bone"
                >
                  How to install
                </Link>
              </div>
              <dl className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ["6+1", "analysts incl. red team"],
                  ["100%", "claims fact-checked"],
                  ["24/7", "memory on your device"],
                  ["1,000", "sats a month"],
                ].map(([n, l]) => (
                  <div key={l} className="card px-4 py-3.5">
                    <dt className="font-display text-[1.5rem] font-semibold text-bone">{n}</dt>
                    <dd className="mt-0.5 font-mono text-[0.56rem] uppercase tracking-[0.18em] text-bone/45">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-6 rounded-[2rem] opacity-40 blur-2xl"
                style={{ background: "radial-gradient(closest-side, #57452f55, transparent)" }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/terminal-mock.svg"
                alt="TruffleTrade research terminal: live chart, council votes, and an audited thesis"
                className="relative w-full rounded-2xl border border-truffle-400/20 shadow-2xl shadow-black/60"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Pipeline image band */}
      <section className="px-5 pb-8 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/council-flow.svg"
            alt="Pipeline: ingest, model, debate, verify, attack, remember"
            className="w-full rounded-2xl border border-truffle-400/15"
          />
        </div>
      </section>

      {/* Council */}
      <section id="product" className="scroll-mt-20 px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/80">The council</span>
          <h2 className="font-display mt-5 max-w-2xl text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] text-bone">
            Rivals, not yes-men
          </h2>
          <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-bone/55">
            Every analysis is a structured argument, not a chatbot answer. Six specialists with conflicting mandates
            investigate the same chart independently — then fight it out in front of a hostile referee.
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {ANALYSTS.map((a) => (
              <article key={a.name} className="card group relative overflow-hidden p-6">
                <div
                  aria-hidden
                  className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-15 blur-2xl transition-opacity group-hover:opacity-30"
                  style={{ background: a.color }}
                />
                <h3 className="font-mono text-[0.95rem] font-semibold tracking-[0.14em]" style={{ color: a.color }}>
                  {a.name}
                </h3>
                <p className="mt-4 text-[0.92rem] leading-relaxed text-bone/60">{a.brief}</p>
              </article>
            ))}
            <article className="card relative overflow-hidden border-blood/30 p-6">
              <div aria-hidden className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blood opacity-20 blur-2xl" />
              <h3 className="font-mono text-[0.95rem] font-semibold tracking-[0.14em] text-blood">RED TEAM</h3>
              <p className="mt-4 text-[0.92rem] leading-relaxed text-bone/60">
                A hostile risk committee paid to say no. If the evidence is too thin, no analysis is issued at all.
                Fail-closed, always.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Memory section with image */}
      <section className="px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/80">The memory</span>
              <h2 className="font-display mt-5 text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] text-bone">
                It remembers.
                <br />
                <span className="text-truffle-400">It gets better.</span>
              </h2>
              <p className="mt-5 text-[0.95rem] leading-relaxed text-bone/55">
                Most AI tools reset to zero every session. TruffleTrade builds a memory on your device: every
                prediction is stored and later resolved against reality, every regime observation is kept, and every
                analysis leaves behind distilled insights.
              </p>
              <ul className="mt-6 space-y-3 text-[0.92rem] text-bone/65">
                {[
                  "Digital-twin trainer: thousands of simulated markets calibrated on real candles",
                  "Automatic consolidation every 6 hours — duplicates merge, stale facts decay",
                  "Federated learning across installs: hashed summaries only, never your data",
                  "Forecast audit computes directional accuracy across every matured prediction",
                ].map((f) => (
                  <li key={f} className="flex gap-3">
                    <span aria-hidden className="text-truffle-400">◆</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/memory-graph.svg"
              alt="Memory graph: outcome, regime, risk, insight, twin, prediction, federated and audit nodes"
              className="w-full rounded-2xl border border-truffle-400/15"
            />
          </div>
        </div>
      </section>

      {/* Open source band */}
      <section className="px-5 pb-20 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <div className="card flex flex-col items-start justify-between gap-6 p-8 md:flex-row md:items-center">
            <div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.28em] text-truffle-300/70">Open source, honestly</span>
              <h3 className="font-display mt-2 text-[1.6rem] font-semibold text-bone">Read every line before you trust it</h3>
              <p className="mt-2 max-w-2xl text-[0.92rem] leading-relaxed text-bone/55">
                The council, the fact-checker, the red team, the memory, the twin — all MIT-licensed on GitHub. A no-KYC
                product earns trust by being auditable.
              </p>
            </div>
            <a
              href="https://github.com/cameronorr2011-beep/AI-STOCK-TRADER"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-full border border-truffle-400/40 px-7 py-3.5 font-mono text-[0.7rem] uppercase tracking-[0.22em] text-truffle-300 transition-colors hover:bg-truffle-500/15"
            >
              View source
            </a>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/80">Pricing</span>
          <h2 className="font-display mt-5 max-w-2xl text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] text-bone">
            One price. No KYC. Paid in sats.
          </h2>
          <div className="mt-12 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            <article className="card border-truffle-400/30 p-8">
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-truffle-300">TruffleTrade</span>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-[3.2rem] font-semibold leading-none text-bone">1,000</span>
                <span className="font-mono text-[0.8rem] uppercase tracking-[0.2em] text-bone/50">sats / 30 days</span>
              </div>
              <ul className="mt-6 space-y-3 text-[0.92rem] text-bone/65">
                {[
                  "Unlimited chart analyses — any ticker, any time",
                  "Six-analyst council + fact-checker + red team",
                  "Local memory system with automatic updates",
                  "Federated learning from every installation",
                  "All future engine upgrades while subscribed",
                  "No KYC — pay from any Lightning wallet",
                ].map((f) => (
                  <li key={f} className="flex gap-3">
                    <span aria-hidden className="text-truffle-400">◆</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/buy"
                className="mt-8 inline-block rounded-full bg-truffle-500 px-7 py-3.5 font-mono text-[0.72rem] uppercase tracking-[0.22em] text-void transition-colors hover:bg-truffle-400"
              >
                Pay with Lightning
              </Link>
              <p className="mt-4 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-bone/35">
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
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/80">FAQ</span>
          <h2 className="font-display mt-5 text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.05] text-bone">
            Straight answers
          </h2>
          <div className="mt-10 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="card group p-5">
                <summary className="cursor-pointer list-none font-display text-[1.1rem] font-semibold text-bone marker:hidden">
                  <span className="mr-3 font-mono text-truffle-400 transition-transform group-open:rotate-90 inline-block">→</span>
                  {f.q}
                </summary>
                <p className="mt-3 pl-8 text-[0.92rem] leading-relaxed text-bone/60">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-10 max-w-3xl rounded-xl border border-truffle-400/20 bg-truffle-600/5 p-5 text-[0.85rem] leading-relaxed text-bone/55">
            <strong className="text-truffle-200">Honest disclaimer:</strong> TruffleTrade produces research and analysis
            — it does not execute trades and is not investment advice. You must be 18+, or 13–17 with parental consent
            and supervision. See the{" "}
            <Link href="/terms" className="text-truffle-300 underline decoration-truffle-400/40 underline-offset-2">Terms</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
