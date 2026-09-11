import Link from "next/link";
import BuyPanel from "@/components/site/BuyPanel";

const ANALYSTS = [
  { name: "FUNDAMENTALS", brief: "Balance sheets, margins, growth quality. Numbers first, narrative second.", color: "#f5c26b" },
  { name: "VALUATION", brief: "DCF, reverse-DCF, peer comps — every assumption exposed, no bare fair-value promises.", color: "#d9903c" },
  { name: "TECHNICALS", brief: "Deterministic indicators computed in code; the AI interprets them, never invents them.", color: "#9c5a1c" },
  { name: "MACRO", brief: "SPY, VIX, yields, the dollar. Regime first, chart second.", color: "#f8d795" },
  { name: "COMPETITION", brief: "Reads the peer set: who's winning the margin war, who's losing the multiple.", color: "#75603f" },
  { name: "NEWS", brief: "Headlines as evidence — sourced, dated, and distrusted until verified.", color: "#57452f" },
];

const PILLARS = [
  {
    kicker: "The novel part",
    title: "Adversarial by design",
    body: "One model, one opinion, one blind spot — that's a hedge fund. TruffleTrade runs six rival analysts with opposing mandates, then makes an adversary attack the winning case before it reaches you. If the evidence is too thin, the red team rejects the whole exercise and nothing is issued. Bad analysis has to survive a hostile committee.",
  },
  {
    kicker: "A memory that learns",
    title: "Every prediction audited, forever",
    body: "Each run distills what the system believed into memory facts: regimes observed, predictions made, outcomes resolved. A digital-twin trainer replays thousands of synthetic markets calibrated on real candles to build priors. Your memory lives on your device, updates automatically, and improves the next analysis.",
  },
  {
    kicker: "Federated by default",
    title: "Collective learning, zero data leaks",
    body: "Installs exchange only what federated learning allows: hashed subjects and count summaries — never your watchlist, never your notes, never raw content. The aggregated weights come back to every subscriber. The hive gets smarter; your data stays yours.",
  },
  {
    kicker: "Open source, honestly",
    title: "You can read every line",
    body: "The complete engine — agents, fact-checker, red team, memory, twin — is MIT-licensed on GitHub. The AI runs on our infrastructure behind your subscription, so you never manage API keys. What you're paying for is the intelligence pipeline, and you can audit all of it.",
  },
];

const CYCLE = [
  ["01", "Ingest", "Candles, fundamentals, headlines, macro — keyless public sources, honest DATA UNAVAILABLE when gated."],
  ["02", "Model", "Deterministic DCF, reverse-DCF, comps and indicators computed in code with exposed assumptions."],
  ["03", "Debate", "Six analysts investigate independently — stance, confidence, rationale, all on the record."],
  ["04", "Verify", "Every numeric claim is extracted and checked against the data. Unsupported numbers are stripped."],
  ["05", "Attack", "The red team cross-examines the consensus. Thin evidence = REJECT. Fail-closed, always."],
  ["06", "Remember", "Insights, predictions and outcomes become memory. The twin trains. Federated updates sync."],
];

export default function LandingPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden px-5 pb-24 pt-20 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-320px] h-[640px] w-[900px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(closest-side, #57452f, transparent)" }}
        />
        <div className="relative mx-auto max-w-[1280px]">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/80">
            AI chart intelligence · Council of rivals · Memory included
          </span>
          <h1 className="font-display mt-6 max-w-4xl text-[clamp(2.6rem,6.5vw,5.2rem)] font-semibold leading-[1.02] tracking-[-0.02em] text-bone">
            The market buries signal.
            <br />
            <span className="text-truffle-400">We dig it up.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-[1.05rem] leading-relaxed text-bone/60">
            TruffleTrade aims six rival AI analysts, a fact-checker and a red team at any stock chart you point it at —
            then remembers what it learned. It doesn&apos;t trade for you, and it never will without you. It makes sure
            you&apos;ve seen every side of the argument before you click the button yourself.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/buy"
              className="rounded-full bg-truffle-500 px-7 py-3.5 font-mono text-[0.72rem] uppercase tracking-[0.22em] text-void transition-colors hover:bg-truffle-400"
            >
              Get access — 1,000 sats/mo
            </Link>
            <a
              href="https://github.com/cameronorr2011-beep/AI-STOCK-TRADER"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-bone/25 px-7 py-3.5 font-mono text-[0.72rem] uppercase tracking-[0.22em] text-bone/75 transition-colors hover:border-truffle-400/50 hover:text-bone"
            >
              Read the source
            </a>
          </div>
          <dl className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["6+1", "analysts incl. red team"],
              ["100%", "claims fact-checked"],
              ["24/7", "memory on your device"],
              ["1,000", "sats a month"],
            ].map(([n, l]) => (
              <div key={l} className="card px-5 py-4">
                <dt className="font-display text-[1.7rem] font-semibold text-bone">{n}</dt>
                <dd className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-bone/45">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Council */}
      <section id="product" className="scroll-mt-20 px-5 py-24 sm:px-8">
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
                <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.24em] text-bone/40">Analyst</p>
                <p className="mt-4 text-[0.92rem] leading-relaxed text-bone/60">{a.brief}</p>
              </article>
            ))}
            <article className="card relative overflow-hidden border-blood/30 p-6">
              <div aria-hidden className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blood opacity-20 blur-2xl" />
              <h3 className="font-mono text-[0.95rem] font-semibold tracking-[0.14em] text-blood">RED TEAM</h3>
              <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.24em] text-bone/40">Adversary</p>
              <p className="mt-4 text-[0.92rem] leading-relaxed text-bone/60">
                A hostile risk committee paid to say no. It attacks the weak arguments, the thin evidence, the stale
                numbers — and if the case doesn&apos;t survive, no analysis is issued at all. Fail-closed.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto grid max-w-[1280px] gap-5 md:grid-cols-2">
          {PILLARS.map((p) => (
            <article key={p.title} className="card p-7">
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.28em] text-truffle-300/70">{p.kicker}</span>
              <h3 className="font-display mt-3 text-[1.5rem] font-semibold text-bone">{p.title}</h3>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-bone/55">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* The cycle */}
      <section className="px-5 pb-28 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/80">The pipeline</span>
          <h2 className="font-display mt-5 max-w-2xl text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] text-bone">
            From chart to conviction, in six steps
          </h2>
          <ol className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-6">
            {CYCLE.map(([n, t, d]) => (
              <li key={n} className="card p-5">
                <span className="font-mono text-[0.7rem] text-truffle-300/80">{n}</span>
                <h3 className="font-display mt-2 text-[1.15rem] font-semibold text-bone">{t}</h3>
                <p className="mt-2 text-[0.82rem] leading-relaxed text-bone/50">{d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-3xl rounded-xl border border-truffle-400/20 bg-truffle-600/5 p-5 text-[0.85rem] leading-relaxed text-bone/55">
            <strong className="text-truffle-200">Honest disclaimer:</strong> TruffleTrade produces research and
            analysis — it does not execute trades and is not investment advice. Forecasts are versioned and audited
            against reality, including the misses. You make every final decision with your own broker.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 px-5 pb-28 sm:px-8">
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
    </div>
  );
}
