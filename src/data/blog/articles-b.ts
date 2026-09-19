import type { BlogPost } from "./posts";

/** Long-form field notes, part B. */
export const ARTICLES_B: BlogPost[] = [
  {
    slug: "digital-twins-for-stock-research",
    title: "Digital twins for stock research: simulating the market you can't wait for",
    description:
      "You can't run a stock forward in time to test a thesis — but you can build a calibrated simulator and run it thousands of times. What a market digital twin is, why block bootstrapping beats a Gaussian random walk, and how TruffleTrade uses twins to train its memory and frame outcomes as ranges.",
    date: "2026-09-15",
    minutes: 9,
    tags: ["digital twins", "simulation", "memory"],
    body: [
      {
        paragraphs: [
          "The slowest thing in investing is feedback. You form a view, you act, and then you wait — weeks, quarters, years — to learn whether you were right, and by then the market has changed so much that the lesson barely transfers. Engineers solved the equivalent problem long ago with digital twins: calibrated simulators of a jet engine or a power grid that let you run ten thousand scenarios before touching the real thing. Markets are not jet engines. But the core move — build a model from real measurements, then interrogate it faster than reality allows — carries over surprisingly well, provided you are honest about what the model can and cannot know.",
        ],
      },
      {
        heading: "What a market twin is (and is not)",
        paragraphs: [
          "A market digital twin, as TruffleTrade uses the term, is a stochastic model of one instrument's daily returns, calibrated on that instrument's own real price history. Given a starting price, it generates plausible forward paths — not one prediction, but a distribution of futures consistent with how the stock has actually behaved. It is not a forecast of where the price will go. It is a statement about the range of places the price could go if the future rhymes with the past, which is the most a purely statistical model can honestly claim.",
          "That distinction matters because the twin's outputs are labeled MODEL OUTPUT everywhere they appear in the product, and every analyst that sees them is instructed to use them to frame the range of outcomes, never as a target. A twin that says '64% of simulated paths end higher over 20 days' is telling you something about volatility and drift under a set of assumptions. It is not telling you to buy.",
        ],
      },
      {
        heading: "Why not just use a random walk?",
        paragraphs: [
          "The textbook approach is geometric Brownian motion: estimate the mean and standard deviation of daily log returns and draw from a normal distribution. It is simple, fast, and wrong in the ways that matter most. Real return series have fat tails — moves of four or five standard deviations happen far more often than a Gaussian allows. They cluster volatility — quiet days follow quiet days, violent days follow violent days. And they carry short-range structure that a memoryless draw throws away entirely. A GBM twin will systematically understate the probability of the exact events that destroy portfolios.",
          "TruffleTrade's default twin uses a block bootstrap instead. Take the actual sequence of daily log returns, cut it into consecutive blocks of five trading days, and build each simulated path by stitching randomly chosen blocks together. Because the blocks are real, the fat tails are real; because they are consecutive, the volatility clustering within each week is preserved. You give up the tidy closed-form math and gain a simulator that produces drawdowns roughly as ugly as the ones that actually happened. That is the trade you want.",
        ],
      },
      {
        heading: "What the twin is used for",
        paragraphs: [
          "The first use is direct: on the AI Analyst screen, the twin replays a couple of hundred seeded paths forward from the live price and reports percentile bands, the share of paths ending higher, the worst simulated drawdown and the daily volatility it was calibrated on. Seeded means deterministic — the same ticker and horizon produce the same distribution every time, so the output is auditable rather than a fresh roll of the dice. The conversational analyst receives the same summary and is required to label anything derived from it as MODEL.",
          "The second use is more unusual. The twin trains the memory. Between sessions, TruffleTrade replays hundreds of synthetic markets for the tickers you follow and distills the regularities — the distribution of outcomes, the probability of a positive period, the regime mix, the worst drawdown — into memory facts tagged with a twin source. Those facts become priors: the next time an analyst reasons about the ticker, it knows what 'normal' looks like for that instrument and can say whether the current setup is unusual. The memory system consolidates every six hours, merging near-duplicate facts and letting stale ones decay, so the priors track the present rather than fossilizing.",
        ],
      },
      {
        heading: "The honest limits",
        paragraphs: [
          "A twin calibrated on history assumes the future is drawn from the same distribution as the past. Regime changes break that assumption: a company that just lost its largest customer, an instrument entering its first rate-hiking cycle, a sector facing new regulation. The twin cannot see any of that, which is precisely why it is one input to the council and not the council itself. Fundamentals, news, macro and the red team exist to catch what a return series cannot.",
          "Two more limits. Bootstrap twins reproduce past volatility clustering within blocks but not across them, so multi-month volatility regimes are only partially captured. And any twin, however well built, produces confident-looking percentiles that are easy to over-trust. TruffleTrade guards against this the only way that works: by labeling, by forcing analysts to cite the twin as a range rather than a point, and by keeping the twin's own predictions on the record next to how the real price resolved. A simulator that is never graded is a toy. A simulator whose misses you can read is a tool.",
        ],
      },
    ],
  },
  {
    slug: "bitcoin-lightning-software-subscriptions",
    title: "Paying for software with Lightning: 1,000 sats and no account",
    description:
      "Why a research tool would choose Bitcoin Lightning over cards and accounts: what a Lightning payment actually is, how an access code replaces a login, what it costs the user, what it prevents, and where the trade-offs bite.",
    date: "2026-09-16",
    minutes: 7,
    tags: ["bitcoin", "lightning", "payments", "privacy"],
    body: [
      {
        paragraphs: [
          "Most software subscriptions begin with a form. Name, email, password, card number, billing address, sometimes a phone number for 'security'. The vendor stores all of it, forever, on servers you will never see, protected by security you cannot audit. Then it charges you every month until you find the cancellation page. TruffleTrade's checkout is a QR code. You scan it with a Lightning wallet, send 1,000 satoshis, and an access code appears on the screen. That is the entire relationship.",
        ],
      },
      {
        heading: "What a Lightning payment is",
        paragraphs: [
          "The Lightning Network is a second layer on top of Bitcoin that routes payments through a mesh of pre-funded channels instead of writing every transaction to the blockchain. The result is settlement in seconds, fees measured in fractions of a cent, and amounts small enough to price a subscription in the equivalent of a coffee. A 'sat' is one hundred-millionth of a bitcoin; 1,000 sats is on the order of a dollar depending on the exchange rate. The payment is final when it arrives — there is no chargeback mechanism, no intermediary holding funds, and no dispute process, which is a feature for the vendor and something the buyer should understand going in.",
          "For the user, the experience is the same regardless of wallet. Wallet of Satoshi, Phoenix, Zeus, Muun, Strike — anything that speaks Lightning can scan the code and pay. The site polls the order until the payment is confirmed, then issues the code. Usually this takes under a minute.",
        ],
      },
      {
        heading: "An access code instead of an account",
        paragraphs: [
          "The access code is the part people find strange, and it is the part that does the most work. It is a machine-generated string — twelve random base32 characters plus a four-character HMAC checksum — that the app sends with every AI request. The gateway validates it, checks that the 30-day window is still open, applies a per-code rate limit, and forwards the request to the model. There is no username to leak, no password to reuse, and no email to phish. On the server, the code is stored only as a hash; the plaintext exists in exactly one moment, when it is shown to you.",
          "This also means responsibility shifts. The code is your license. If you lose it, you retrieve it from the order page that issued it; there is no 'forgot password' flow because there is no identity to verify. Most people bookmark the order link or paste the code into a password manager the moment they see it. It takes ten seconds and removes the only real failure mode.",
        ],
      },
      {
        heading: "What this design prevents",
        paragraphs: [
          "No stored payment methods means no card database to breach. No accounts means no identity data to lose. No auto-renewal means no surprise charges and no dark-pattern cancellation flow — when the 30 days end, access ends, and renewing is a deliberate new payment. No chargebacks means the vendor is not exposed to fraud, which is part of why the price can be low. And because the AI credentials live on the gateway rather than in the app you download, a leaked customer machine cannot burn anyone's API account: the worst case is one access code being rate-limited and revoked.",
          "For a product that calls itself no-KYC, this is the consistent version. Asking for a name and email would not be 'light KYC'; it would be a data-retention liability dressed up as onboarding.",
        ],
      },
      {
        heading: "Where the trade-offs bite",
        paragraphs: [
          "Lightning is not universal. If you have never held bitcoin, the first purchase involves installing a wallet and acquiring a small amount of sats — a real onboarding cost that card checkout does not have. Exchange-rate movement means the dollar cost of 1,000 sats drifts week to week. Finality means a mistaken payment cannot be reversed by a bank; it can only be fixed by the vendor honoring it, which TruffleTrade does when a confirmed payment did not yield a working code. And the absence of accounts means the vendor cannot email you when something changes; the product surfaces its own notices instead.",
          "Whether those costs are worth it depends on what you value. For a research tool whose entire pitch is 'you can audit what we do and we hold as little of your data as physically possible', the payment rail had to match the philosophy. Cards would have been easier. They would also have been a contradiction.",
        ],
      },
    ],
  },
  {
    slug: "how-to-evaluate-ai-stock-analysis-tools",
    title: "How to evaluate an AI stock analysis tool: a 12-point checklist",
    description:
      "AI stock tools are multiplying and most of them are a chatbot with a ticker box. Twelve questions that separate research systems from confidence machines — data provenance, number verification, red-teaming, forecast audits, memory, execution boundaries, and more.",
    date: "2026-09-17",
    minutes: 9,
    tags: ["buyer's guide", "AI stock analysis", "due diligence"],
    body: [
      {
        paragraphs: [
          "Every week another product promises AI-powered stock picks. Some are serious research instruments. Many are a large language model behind a ticker search box, restyled with candlestick wallpaper and a confidence percentage nobody can explain. From the outside they look alike: both produce fluent paragraphs about a company on demand. The differences are architectural, and you can find them by asking the right questions before you pay. Here are twelve, in roughly the order that matters.",
        ],
      },
      {
        heading: "1–3: Where do the numbers come from?",
        paragraphs: [
          "One: can the tool tell you the source and timestamp of every figure it shows? If a P/E appears without an as-of date and a provider, you do not know whether it is live, stale, or generated. Two: are indicators computed in code or by the model? Ask directly. If a language model is 'reading the chart', it is guessing; RSI, moving averages and volatility are arithmetic and should be done deterministically. Three: what happens when data is missing? The honest answer is a visible 'unavailable'. The dishonest answer is a number anyway. Test this with a recent IPO or a thinly covered small cap and watch what the tool does with the gaps.",
        ],
      },
      {
        heading: "4–6: Is anything checked?",
        paragraphs: [
          "Four: is there a mechanism — not a prompt, a mechanism — that verifies the model's numeric claims against the data? A tool that cannot describe how it catches a hallucinated margin has no way of knowing how often it happens. Five: is there any adversarial step? A single model reviewing its own output is not a red team. Look for a separate process with a mandate to object, and ask what it can do when it objects: if it cannot block a conclusion, it is decoration. Six: can the system say 'no'? A research tool that produces a stance for every ticker under every condition is producing noise for some of them. The ability to return 'insufficient evidence' and issue nothing is a feature, not a bug.",
        ],
      },
      {
        heading: "7–9: Is it accountable?",
        paragraphs: [
          "Seven: are past calls kept on the record, including the misses? Any tool can show you a highlight reel. Ask for the directional accuracy across all matured forecasts and for the definition of 'matured'. If forecasts are not stored and resolved against real prices, there is no accuracy to speak of. Eight: are conclusions versioned? When a thesis changes, can you see the previous version and what changed? Nine: are prompts and models versioned on each output? This sounds like an implementation detail, but it is the only way to attribute a change in behavior to a change in the system rather than a change in the market.",
        ],
      },
      {
        heading: "10–12: What does it do with you?",
        paragraphs: [
          "Ten: does it execute trades, and if so, why? Research and execution are different products with different failure modes, and a tool that blurs them has an incentive to keep you active. A research instrument should stop at the argument and leave the button to you. Eleven: what does it learn between sessions, and where does that learning live? A system that resets to zero each time cannot improve; a system that improves by uploading your watchlist and notes to a vendor's servers has a different problem. Look for on-device memory with a clear statement of what, if anything, leaves the machine. Twelve: can you read the source? Closed AI research is a request for faith. Open source does not make a tool correct, but it makes the previous eleven questions answerable by anyone with an afternoon rather than by the vendor's marketing page.",
        ],
      },
      {
        heading: "How TruffleTrade answers",
        paragraphs: [
          "Because you should be able to apply the checklist to the people who wrote it: every figure in TruffleTrade carries a provider and an as-of timestamp; indicators and valuation models are deterministic code; missing data renders as DATA UNAVAILABLE; a fact-checker extracts and verifies every numeric claim and strips the ones that fail; a red team with veto power runs after the nine analysts and rejects thin runs; forecasts are stored and resolved against live prices with the misses displayed; theses and prompts are versioned; the research engine has no brokerage integration by design; the memory lives in a SQLite file on your disk and federated learning shares only hashed counts; and the whole thing is MIT-licensed on GitHub. Where it falls short — qualitative claims are not mechanically checkable, the twin inherits the past — the documentation says so. Hold every tool, including this one, to that standard.",
        ],
      },
    ],
  },
];
