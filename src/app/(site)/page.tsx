import Link from "next/link";
import BuyPanel from "@/components/site/BuyPanel";
import CandleChart from "@/components/market/CandleChart";
import VideoCard from "@/components/site/VideoCard";
import { JsonLd } from "@/components/site/JsonLd";
import { REPO_URL, faqJsonLd, softwareApplicationJsonLd } from "@/lib/seo";

const ANALYSTS = [
  { name: "Fundamentals", brief: "Balance sheets, margins, growth quality. Numbers first, narrative second.", ink: "#6fc394" },
  { name: "Valuation", brief: "DCF, reverse-DCF, peer comps — every assumption exposed, no bare fair-value promises.", ink: "#e6b95f" },
  { name: "Technicals", brief: "Deterministic indicators computed in code; the AI interprets them, never invents them.", ink: "#6cc3cf" },
  { name: "Macro", brief: "SPY, VIX, yields, the dollar. Regime first, chart second.", ink: "#b39ddb" },
  { name: "Competition", brief: "Reads the peer set: who's winning the margin war, who's losing the multiple.", ink: "#e0a27a" },
  { name: "News", brief: "Headlines as evidence — sourced, dated, and distrusted until verified.", ink: "#e08c8c" },
  { name: "Chart patterns", brief: "Reads the raw OHLC series: structure, breaks, volatility contraction before expansion.", ink: "#7fa8e0" },
  { name: "Scenario", brief: "Bull / base / bear cases — each with the assumption that must come true.", ink: "#b9c86f" },
  { name: "Backtest", brief: "Replays this exact setup over the ticker's own 3-year history. Sample sizes cited.", ink: "#c99ac9" },
];

const STEPS = [
  { n: "01", title: "Point it at a chart", text: "Type any ticker. Live candles, fundamentals, headlines and macro series are pulled keylessly — honest DATA UNAVAILABLE when a source is gated." },
  { n: "02", title: "The council argues", text: "Nine rival analysts investigate in parallel, every numeric claim is fact-checked against the data pack, and a red team cross-examines the consensus." },
  { n: "03", title: "It remembers", text: "Predictions are stored, later resolved against reality, and distilled into a memory on your device that trains on digital-twin markets between sessions." },
];

const ECOSYSTEM = [
  { icon: "◈", title: "Theses", text: "Write structured investment theses — claim, evidence, counterarguments, and the exact conditions that would prove you wrong. Black Truffle checks them against new information." },
  { icon: "✎", title: "Decision journal", text: "Record what you believed, why, and what would prove you wrong. Come back and record what actually happened. Patterns surface — no grades, just your own record." },
  { icon: "❖", title: "Learn", text: "Ten topics from chart reading to behavioral finance. Lessons adapt to your progress, and every quick-check is remembered so explanations meet you where you are." },
  { icon: "◑", title: "My Market Intelligence", text: "A transparent dashboard of your own patterns: focus assets, research streaks, expectation-vs-outcome, and learning progress. Every number traces to your records." },
];

const TRUFFLES = [
  {
    name: "Black Truffle",
    role: "Personal AI assistant",
    text: "Your memory, research, learning, and TruffleTrade ecosystem. It retrieves your theses and journal, drafts new ones with you, and delegates chart reads.",
    tone: "gold" as const,
  },
  {
    name: "White Truffle",
    role: "AI market analyst",
    text: "The specialist: nine-analyst council, fact-checker, red team, backtester. Focused stock-chart intelligence — deliberately not a general-purpose chatbot.",
    tone: "green" as const,
  },
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
    q: "What are theses, the journal, and My Market Intelligence?",
    a: "Your personal research layer. Theses are structured beliefs with explicit invalidation conditions. The decision journal records what you believed and what actually happened. My Market Intelligence surfaces transparent patterns from your own records — focus assets, streaks, expectation-vs-outcome — never grades. Black Truffle, your personal AI, reads and connects all of it.",
  },
  {
    q: "Why bitcoin and not a card?",
    a: "1,000 sats over Bitcoin Lightning means no accounts, no chargebacks, no stored payment methods, and no identity documents. Pay, get your code, run the app. Renewal is always a deliberate new payment.",
  },
  {
    q: "Is TruffleTrade free?",
    a: "The desktop app — live candlestick charts, watchlists, market news and macro data — is free to download and use. TruffleTrade AI (the nine-analyst council, red team, backtester and memory) requires an activation key: 1,000 sats per 30 days.",
  },
  {
    q: "Is this investment advice?",
    a: "No. TruffleTrade is research software. Outputs can be wrong; forecasts are audited publicly including the misses. You are responsible for your decisions, capital, and taxes.",
  },
];

const DOWNLOAD = "/api/download/desktop";

// Rich results: SoftwareApplication + the on-page FAQ (Organization/WebSite
// are emitted once in the site layout).
const homeJsonLd = [softwareApplicationJsonLd(), faqJsonLd(FAQ.map((f) => ({ question: f.q, answer: f.a })))];

export default function LandingPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden px-5 pb-16 pt-14 sm:px-8 sm:pt-20">
        <div aria-hidden className="grid-dots pointer-events-none absolute inset-0 opacity-70" />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-320px] h-[640px] w-[980px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(223,174,76,0.35), transparent)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-200px] top-[120px] h-[420px] w-[520px] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(111,195,148,0.35), transparent)" }}
        />
        <div className="relative mx-auto max-w-[1280px]">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <span className="arrive arrive-1 inline-flex items-center gap-2 rounded-full border border-truffle-400/25 bg-soil-900/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[1.4px] text-truffle-300 backdrop-blur">
                <span aria-hidden className="live-dot" style={{ width: 5, height: 5 }} />
                AI stock analysis · Council of rivals · Memory included
              </span>
              <h1 className="arrive arrive-2 mt-6 text-[clamp(2.5rem,5.6vw,4.4rem)] font-extrabold leading-[1.02] tracking-[-2.6px] text-ink">
                Less noise.
                <br />
                <span className="text-gold">More signal.</span>
              </h1>
              <p className="arrive arrive-3 mt-6 max-w-xl text-[15.5px] leading-relaxed text-bone-soft">
                TruffleTrade points nine rival AI analysts, a fact-checker, and a red team at any stock chart — then
                remembers what it learned. Theses, a decision journal, and adaptive lessons turn analysis into a
                system: research in, honest patterns out. It doesn&apos;t trade for you. It makes sure you&apos;ve seen
                every side of the argument before you click the button yourself.
              </p>
              <div className="arrive arrive-4 mt-8 flex flex-wrap items-center gap-3.5">
                <a href={DOWNLOAD} className="btn-primary !px-7 !py-3.5 !text-[12.5px]">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <path d="M8 1.5a.75.75 0 0 1 .75.75v6.19l1.97-1.97a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.53a.75.75 0 0 1 1.06-1.06l1.97 1.97V2.25A.75.75 0 0 1 8 1.5ZM2.75 11a.75.75 0 0 1 .75.75v1.5h9v-1.5a.75.75 0 0 1 1.5 0v2.25a.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1-.75-.75v-2.25a.75.75 0 0 1 .75-.75Z" />
                  </svg>
                  Download TruffleTrade — free
                </a>
                <Link href="/buy" className="btn-secondary !px-7 !py-3.5 !text-[12.5px]">
                  Activate TruffleTrade AI — 1,000 sats/mo
                </Link>
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.8px] text-faint">
                Windows installer · app is free · AI requires an activation key · MIT source
              </p>
              <dl className="mt-11 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ["9+1", "analysts incl. red team"],
                  ["100%", "claims fact-checked"],
                  ["2", "AIs: analyst + personal"],
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
                className="absolute -inset-6 rounded-[2rem] opacity-70 blur-2xl"
                style={{ background: "radial-gradient(closest-side, rgba(223,174,76,0.22), transparent)" }}
              />
              <div className="relative animate-float">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/terminal-mock.svg"
                  alt="TruffleTrade research terminal: live chart, council votes, and an audited thesis"
                  width={1120}
                  height={720}
                  fetchPriority="high"
                  className="w-full rounded-2xl border border-truffle-400/20 shadow-2xl shadow-black/60 ring-1 ring-white/[0.04]"
                />
                <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-[1.2px] text-faint">
                  and below — the real thing, running live
                </p>
              </div>
            </div>
          </div>

          {/* Live chart strip — proof the data is real */}
          <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <CandleChart ticker="NVDA" compact title="NVDA — live market candles" />
            <div className="card flex flex-col justify-between p-5">
              <div>
                <p className="eyebrow">Right now</p>
                <p className="mt-3 text-[15px] font-bold leading-snug text-ink">
                  The workspace on this page is fed by live markets.
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-bone-soft">
                  Keyless Yahoo Finance candles, macro series, sector breadth — the same data the council reasons over.
                </p>
              </div>
              <Link href="/dashboard" className="btn-secondary mt-4 w-full">
                Open the live dashboard →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <article key={s.n} className="card relative overflow-hidden p-6">
                <span aria-hidden className="absolute -right-3 -top-6 text-[88px] font-extrabold leading-none tracking-[-4px] text-white/[0.035]">
                  {s.n}
                </span>
                <span className="eyebrow">Step {i + 1}</span>
                <h2 className="mt-3 text-[17px] font-bold tracking-[-0.4px] text-ink">{s.title}</h2>
                <p className="mt-2 text-[13px] leading-relaxed text-bone-soft">{s.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Two Truffles */}
      <section id="truffles" className="scroll-mt-20 px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <span className="eyebrow">Two AIs, one system</span>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.8rem,3.8vw,2.9rem)] font-extrabold leading-[1.08] tracking-[-1.6px] text-ink">
            A specialist and a personal chief of staff
          </h2>
          <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-bone-soft">
            They share one memory backbone and one subscription — and never blur their jobs. The analyst reads the
            market. The assistant knows you.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {TRUFFLES.map((t) => (
              <article key={t.name} className="card relative overflow-hidden p-6">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-50 blur-2xl"
                  style={{ background: t.tone === "gold" ? "radial-gradient(closest-side, rgba(223,174,76,0.3), transparent)" : "radial-gradient(closest-side, rgba(111,195,148,0.3), transparent)" }}
                />
                <span className="eyebrow" style={t.tone === "gold" ? { color: "#e8ae52" } : undefined}>
                  {t.role}
                </span>
                <h3 className="mt-3 text-[19px] font-bold tracking-[-0.5px] text-ink">{t.name}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-bone-soft">{t.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Ecosystem loop */}
      <section id="ecosystem" className="scroll-mt-20 px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <span className="eyebrow">The ecosystem</span>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.8rem,3.8vw,2.9rem)] font-extrabold leading-[1.08] tracking-[-1.6px] text-ink">
            Research becomes a loop, not a tab you close
          </h2>
          <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-bone-soft">
            You research → White Truffle analyzes → Black Truffle remembers → you form a thesis → the journal records
            your reasoning → the market moves → White Truffle analyzes again → Black Truffle compares → you learn.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ECOSYSTEM.map((f) => (
              <article key={f.title} className="card p-6">
                <span aria-hidden className="text-[20px] text-gold">{f.icon}</span>
                <h3 className="mt-3 text-[15.5px] font-bold tracking-[-0.4px] text-ink">{f.title}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-bone-soft">{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Council */}
      <section id="product" className="scroll-mt-20 px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <span className="eyebrow">The council</span>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.8rem,3.8vw,2.9rem)] font-extrabold leading-[1.08] tracking-[-1.6px] text-ink">
            Rivals, not yes-men
          </h2>
          <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-bone-soft">
            Every analysis is a structured argument, not a chatbot answer. Nine specialists with conflicting mandates
            investigate the same chart in parallel — then defend it in front of a hostile referee.
          </p>

          {/* Simulated session — the product's look, honestly labeled */}
          <div className="relative mt-8">
            <div
              aria-hidden
              className="absolute -inset-4 rounded-[2rem] opacity-50 blur-2xl"
              style={{ background: "radial-gradient(closest-side, rgba(111,195,148,0.16), transparent)" }}
            />
            <div className="relative overflow-hidden rounded-2xl border border-soil-500 shadow-2xl shadow-black/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/council-sim-dark.svg"
                alt="Simulated council session: candlesticks with nine analyst votes and the consensus band"
                width={1120}
                height={560}
                loading="lazy"
                className="w-full"
              />
            </div>
          </div>
          <div className="mt-11 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ANALYSTS.map((a) => (
              <article key={a.name} className="card group p-6">
                <span
                  className="grid h-9 w-9 place-items-center rounded-[10px] text-[13px] font-bold transition-transform group-hover:scale-105"
                  style={{ background: `${a.ink}1f`, color: a.ink, boxShadow: `inset 0 0 0 1px ${a.ink}33` }}
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
            <article className="card p-6" style={{ background: "linear-gradient(180deg, rgba(239,122,95,0.10), rgba(239,122,95,0.03))", borderColor: "rgba(239,122,95,0.3)" }}>
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-blood/15 text-[13px] font-bold text-blood" aria-hidden>
                R
              </span>
              <h3 className="mt-4 text-[15px] font-bold tracking-[-0.3px] text-blood">Red team</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-bone-soft">
                A hostile risk committee paid to say no. If the evidence is too thin, no analysis is issued at all.
                Fail-closed, always.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Memory section */}
      <section id="memory" className="scroll-mt-20 px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <span className="eyebrow">The memory</span>
              <h2 className="mt-4 text-[clamp(1.8rem,3.8vw,2.9rem)] font-extrabold leading-[1.08] tracking-[-1.6px] text-ink">
                It remembers.
                <br />
                <span className="text-forest">It gets better.</span>
              </h2>
              <p className="mt-5 text-[14.5px] leading-relaxed text-bone-soft">
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
              width={1120}
              height={480}
              loading="lazy"
              className="w-full rounded-2xl border border-soil-500 shadow-2xl shadow-black/50"
            />
          </div>
        </div>
      </section>

      {/* Watch the film */}
      <section className="px-5 pb-16 pt-4 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto]">
            <div>
              <span className="eyebrow">The film</span>
              <h2 className="mt-4 max-w-xl text-[clamp(1.8rem,3.8vw,2.9rem)] font-extrabold leading-[1.08] tracking-[-1.6px] text-ink">
                Thirty seconds.
                <br />
                <span className="text-gold">Every side.</span>
              </h2>
              <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-bone-soft">
                A 3D flythrough of the whole idea — the candle canyon, the council, the red team, the ledger of every
                call it ever made — before you install anything. Captioned, so it works on mute. Music: “Invincible” by
                Deaf Kev (NCS).
              </p>
            </div>
            <VideoCard />
          </div>
        </div>
      </section>

      {/* Open source band */}
      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <div className="card-quiet relative flex flex-col items-start justify-between gap-6 overflow-hidden p-8 md:flex-row md:items-center">
            <div aria-hidden className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-truffle-500/10 blur-3xl" />
            <div className="relative">
              <span className="eyebrow">Open source, honestly</span>
              <h3 className="mt-2 text-[24px] font-bold tracking-[-1px] text-ink">Read every line before you trust it</h3>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-bone-soft">
                The council, the fact-checker, the red team, the memory, the twin — all MIT-licensed on GitHub. A no-KYC
                product earns trust by being auditable.
              </p>
            </div>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn-secondary relative shrink-0">
              View source on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <span className="eyebrow">Pricing</span>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.8rem,3.8vw,2.9rem)] font-extrabold leading-[1.08] tracking-[-1.6px] text-ink">
            One price. No KYC. Paid in sats.
          </h2>
          <div className="mt-11 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            <article className="card card-gold p-8">
              <span className="eyebrow">TruffleTrade AI</span>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-gold text-[56px] font-extrabold leading-none tracking-[-2.4px]">1,000</span>
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
              <Link href="/buy" className="btn-primary mt-8 inline-flex">
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
      <section id="faq" className="scroll-mt-20 px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-[900px]">
          <span className="eyebrow">FAQ</span>
          <h2 className="mt-4 text-[clamp(1.8rem,3.6vw,2.8rem)] font-extrabold leading-[1.08] tracking-[-1.6px] text-ink">
            Straight answers
          </h2>
          <div className="mt-9 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="card group p-5 open:border-truffle-400/30">
                <summary className="cursor-pointer list-none text-[15px] font-bold text-ink marker:hidden">
                  <span className="mr-3 inline-block text-truffle-400 transition-transform group-open:rotate-90">→</span>
                  {f.q}
                </summary>
                <p className="mt-3 pl-8 text-[13px] leading-relaxed text-bone-soft">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="card-quiet mt-10 max-w-3xl p-5 text-[12.5px] leading-relaxed text-bone-soft">
            <strong className="font-bold text-ink">Honest disclaimer:</strong> TruffleTrade produces research and
            analysis — it does not execute trades and is not investment advice. You must be 18+, or 13–17 with parental
            consent and supervision. See the{" "}
            <Link href="/terms" className="font-semibold text-truffle-400 underline decoration-truffle-400/40 underline-offset-2 hover:text-truffle-600">
              Terms
            </Link>
            .
          </p>
        </div>
      </section>
      <JsonLd data={homeJsonLd} />
    </div>
  );
}
