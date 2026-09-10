import Link from "next/link";

const AGENTS = [
  { name: "MOMENTUM", style: "Trend-follower", creed: "Rides breakouts and Donchian surges. Wrong in chop, right in trends.", color: "#e2762f" },
  { name: "REVERSION", style: "Mean-reverter", creed: "Fades exhaustion at the bands. Buys panic, sells euphoria.", color: "#ab93ee" },
  { name: "MACRO", style: "Strategist", creed: "Reads SPY, VIXY and the dollar. Regime first, chart second.", color: "#f09a4f" },
  { name: "FLOW", style: "Volume analyst", creed: "Trusts only confirmed volume. Distrusts thin breakouts on principle.", color: "#8464d8" },
  { name: "SENTINEL", style: "Risk guardian", creed: "Votes to protect capital. Would rather miss ten trades than take one bad one.", color: "#d1462f" },
];

const PILLARS = [
  {
    kicker: "The novel part",
    title: "Adversarial by design",
    body: "Hedge funds are monoliths: one model, one opinion, one blind spot. WOLFPIT runs five rival agents with opposing mandates, then makes a sixth — the red team — argue against the winning idea before a single satoshi moves. Bad trades have to survive a hostile committee to exist.",
  },
  {
    kicker: "Full transparency",
    title: "Every debate, on the record",
    body: "Each cycle persists every vote with confidence and rationale, the red team's objections, and the exact fills — in an open SQLite ledger you can query yourself. No black box, no 'our proprietary model'.",
  },
  {
    kicker: "No KYC",
    title: "Keys, not accounts",
    body: "Market data is keyless (Kraken, Coinbase, Yahoo Finance). Paper mode needs nothing at all. Live mode uses your own Kraken API key — crypto-only accounts require no identity verification — capped by a hard exposure limit and a drawdown kill switch.",
  },
  {
    kicker: "Defense in depth",
    title: "Risk engine outranks the AI",
    body: "Stops, targets, time stops and 1% risk-per-trade sizing are enforced by deterministic code the council cannot override. If equity draws down past the kill switch, the desk goes flat and stays flat. The AI proposes; the risk engine disposes.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden px-5 pb-24 pt-20 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-320px] h-[640px] w-[900px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(closest-side, #443080, transparent)" }}
        />
        <div className="relative mx-auto max-w-[1280px]">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-ember-300/75">
            Autonomous BTC desk · Council of rivals · No KYC
          </span>
          <h1 className="font-display mt-6 max-w-4xl text-[clamp(2.6rem,6.5vw,5.2rem)] font-semibold leading-[1.02] tracking-[-0.02em] text-bone">
            Five AIs argue.
            <br />
            A red team kills the bad ideas.
            <br />
            <span className="text-ember-300">The survivors trade.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-[1.05rem] leading-relaxed text-bone/60">
            WOLFPIT is an open-source trading desk where rival agents with opposing mandates debate every
            Bitcoin trade — and an adversarial red team must approve it before execution. Every vote,
            objection and fill lands in a public ledger. Hedge funds can&apos;t show you their thinking.
            This one won&apos;t shut up about it.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/desk"
              className="rounded-full bg-ember-500 px-7 py-3.5 font-mono text-[0.72rem] uppercase tracking-[0.22em] text-void transition-colors hover:bg-ember-400"
            >
              Open the live desk
            </Link>
            <a
              href="https://github.com/cameronorr2011-beep/AI-STOCK-TRADER"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-pit-300/25 px-7 py-3.5 font-mono text-[0.72rem] uppercase tracking-[0.22em] text-bone/75 transition-colors hover:border-pit-300/50 hover:text-bone"
            >
              Read the source
            </a>
          </div>
          <dl className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["5+1", "agents incl. red team"],
              ["100%", "votes on the record"],
              ["0", "KYC required"],
              ["1%", "max risk per trade"],
            ].map(([n, l]) => (
              <div key={l} className="card px-5 py-4">
                <dt className="font-display text-[1.7rem] font-semibold text-bone">{n}</dt>
                <dd className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-bone/45">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* The pit */}
      <section className="px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-ember-300/75">The pit</span>
          <h2 className="font-display mt-5 max-w-2xl text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] text-bone">
            Rivals, not yes-men
          </h2>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {AGENTS.map((a) => (
              <article key={a.name} className="card group relative overflow-hidden p-6">
                <div
                  aria-hidden
                  className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-15 blur-2xl transition-opacity group-hover:opacity-30"
                  style={{ background: a.color }}
                />
                <h3 className="font-mono text-[0.95rem] font-semibold tracking-[0.14em]" style={{ color: a.color }}>
                  {a.name}
                </h3>
                <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.24em] text-bone/40">{a.style}</p>
                <p className="mt-4 text-[0.92rem] leading-relaxed text-bone/60">{a.creed}</p>
              </article>
            ))}
            <article className="card relative overflow-hidden border-ember-400/30 p-6">
              <div aria-hidden className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-ember-500 opacity-20 blur-2xl" />
              <h3 className="font-mono text-[0.95rem] font-semibold tracking-[0.14em] text-ember-300">RED TEAM</h3>
              <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.24em] text-bone/40">Adversary</p>
              <p className="mt-4 text-[0.92rem] leading-relaxed text-bone/60">
                A hostile risk committee paid to say no. It attacks the weak votes, the regime, the vol —
                and nothing executes without surviving it. Fail-closed: if it can&apos;t be reached, nothing trades.
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
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.28em] text-ember-300/70">{p.kicker}</span>
              <h3 className="font-display mt-3 text-[1.5rem] font-semibold text-bone">{p.title}</h3>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-bone/55">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How it runs */}
      <section className="px-5 pb-28 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-ember-300/75">The cycle</span>
          <h2 className="font-display mt-5 max-w-2xl text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.05] text-bone">
            Every {`\u2248`}5 minutes, on repeat
          </h2>
          <ol className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-6">
            {[
              ["01", "Ingest", "BTC candles from Kraken (Coinbase fallback), SPY/VIXY/DXY from Yahoo — keyless."],
              ["02", "Debate", "Five rival agents vote independently with confidence and rationale."],
              ["03", "Tally", "Conviction-weighted net vote must clear the approval threshold."],
              ["04", "Attack", "Red team cross-examines. Fail-closed: no approval, no trade."],
              ["05", "Size", "Risk engine sizes to 1% equity per trade, 2×ATR stop, 3×ATR target."],
              ["06", "Record", "Fills, P&L, every vote — persisted to the open SQLite ledger."],
            ].map(([n, t, d]) => (
              <li key={n} className="card p-5">
                <span className="font-mono text-[0.7rem] text-ember-300/80">{n}</span>
                <h3 className="font-display mt-2 text-[1.15rem] font-semibold text-bone">{t}</h3>
                <p className="mt-2 text-[0.82rem] leading-relaxed text-bone/50">{d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-3xl rounded-xl border border-ember-400/20 bg-ember-600/5 p-5 text-[0.85rem] leading-relaxed text-bone/55">
            <strong className="text-ember-200">Honest disclaimer:</strong> this is an MVP desk built for
            transparency and engineering rigor, not a guaranteed money printer. It defaults to paper mode.
            If you enable live mode, the exposure cap and kill switch are your seatbelt — wear both.
          </p>
        </div>
      </section>
    </div>
  );
}
