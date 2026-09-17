export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO
  minutes: number;
  tags: string[];
  body: { heading?: string; paragraphs: string[] }[];
}

export const POSTS: BlogPost[] = [
  {
    slug: "why-six-analysts-beat-one-model",
    title: "Why six analysts beat one model",
    description:
      "One model has one opinion and one blind spot. TruffleTrade's council of rivals, fact-checker, and red team exist because bad analysis should die in committee — on the record.",
    date: "2026-08-20",
    minutes: 6,
    tags: ["architecture", "adversarial AI"],
    body: [
      {
        paragraphs: [
          "Ask a single large language model what it thinks of a stock and you'll get a confident, fluent, and sometimes fabricated answer. The fluency is the trap: confidence and correctness are uncorrelated in a model that has never been forced to defend its claims. The whole design of TruffleTrade starts from one refusal — we don't let one model's opinion be the product.",
        ],
      },
      {
        heading: "Six mandates, six biases",
        paragraphs: [
          "Every TruffleTrade investigation runs six analysts with deliberately conflicting mandates: Fundamentals reads the balance sheet, Valuation builds the DCF and asks what growth the price already implies, Technicals reads the deterministic indicator pack, Macro insists regime comes before chart, Competition maps the peer set, and News treats every headline as untrusted input until proven otherwise.",
          "The conflicts are the feature. A momentum breakout that Valuation calls priced-in, or a cheap stock that News says is melting down, produces exactly the friction that single-model tools smooth over. Each analyst must emit a stance, a confidence, and a rationale — and every numeric claim they make is extracted and checked against the data pack by a fact-checker. Unsupported numbers are stripped from the report, not just flagged.",
        ],
      },
      {
        heading: "The red team holds veto",
        paragraphs: [
          "After the analysts, a red team cross-examines the consensus with one instruction: find the reasons this analysis is wrong. If the evidence base is too thin — recent listing, gated fundamentals, sparse news — the red team rejects the run and no thesis is issued at all. If the red team is unreachable, the run fails closed. An AI system that must produce an answer under all conditions will eventually produce a dangerous one.",
        ],
      },
      {
        heading: "On the record, forever",
        paragraphs: [
          "Every run is versioned in the ledger with its full transcript: who voted what, with what confidence, and which claims survived the fact-check. Forecasts are resolved against reality — hits and misses alike — and the directional accuracy of the whole system is computed across every matured prediction, not a cherry-picked highlight reel.",
          "That's the honest pitch: not a magic signal, but a structure in which lazy analysis cannot survive unnoticed.",
        ],
      },
    ],
  },
  {
    slug: "memory-that-trains-itself",
    title: "A memory that trains itself: twins and the hive",
    description:
      "TruffleTrade ships with a local memory system: episodic facts from every run, priors distilled from digital twins of the market, and federated learning across installs — with no raw data ever leaving your device.",
    date: "2026-09-01",
    minutes: 8,
    tags: ["memory", "digital twins", "federated learning"],
    body: [
      {
        paragraphs: [
          "Most AI tools have the memory of a goldfish: every session starts from zero, so the same lessons are relearned — or worse, forgotten — forever. TruffleTrade ships with a memory system that lives on your machine, writes itself from every analysis, and updates on a schedule without you touching anything.",
        ],
      },
      {
        heading: "Episodic facts, not chat logs",
        paragraphs: [
          "Memory entries are structured facts, not transcripts. When a research run completes, its key claims become analyst insights. When a forecast matures, the system writes a prediction record and an outcome record — correct or incorrect — so the memory contains calibrated evidence about its own accuracy. Regime observations (calm uptrend, high-vol chop) are recorded with volatility and trend context. Every fact carries a confidence score, a source, and a lightweight embedding so similar facts reinforce each other instead of duplicating.",
        ],
      },
      {
        heading: "The digital twin",
        paragraphs: [
          "Waiting years for live outcomes is a slow way to learn. So the memory trains on digital twins: stochastic market simulators calibrated on real candles. A block-bootstrap model resamples actual historical return windows — preserving fat tails and volatility clustering that a plain Gaussian model throws away — and the trainer replays hundreds of synthetic 20-day markets to distill regularities: the distribution of outcomes, the probability of a positive period, the worst simulated drawdown, the regime mix. These regularities enter memory as twin-sourced facts, clearly labeled as simulated priors, never as observations.",
        ],
      },
      {
        heading: "The hive: federated learning without leaks",
        paragraphs: [
          "Every installation periodically exports a privacy-preserving batch: subjects are cryptographically hashed, contents never included — just counts of fact kinds per hashed subject. The gateway aggregates batches from all subscribers into normalized global weights, and installs pull them back. The hive learns which market conditions the collective is seeing more of, while your watchlist, your notes, and your raw data stay on your disk where they belong.",
          "Consolidation runs automatically every six hours while the app is open: near-duplicate facts merge and reinforce, stale facts decay. The memory that analyzes your charts tomorrow is measurably different from the one that analyzed them today.",
        ],
      },
    ],
  },
  {
    slug: "no-kyc-no-keys-no-nonsense",
    title: "No KYC, no keys, no nonsense",
    description:
      "How TruffleTrade billing works: 1,000 sats over Bitcoin Lightning, an access code instead of an account, and an architecture where your AI credentials are ours — on purpose.",
    date: "2026-09-08",
    minutes: 5,
    tags: ["bitcoin", "payments", "security"],
    body: [
      {
        paragraphs: [
          "TruffleTrade has no accounts. You pay 1,000 satoshis over the Bitcoin Lightning Network, and a machine-generated access code unlocks the product for 30 days. No email, no name, no identity documents. Here's how that works under the hood, and why the AI API key is deliberately not yours.",
        ],
      },
      {
        heading: "Bitcoin in, access code out",
        paragraphs: [
          "When you press 'generate invoice', the site creates an order and shows you the operator's Lightning address as a QR code — send exactly 1,000 sats from any Lightning wallet (Wallet of Satoshi, Phoenix, Zeus, whatever you already use), referencing your order id if your wallet supports notes. The page polls the order until the operator confirms your deposit and your access code appears — usually within minutes. Fulfillment is idempotent: an order can only ever issue one code.",
          "The code itself is unforgeable by construction: 12 random base32 characters plus a 4-character HMAC checksum. Codes are stored only as hashes, so even a database leak doesn't leak working licenses. Renewal is just a new payment — nothing auto-charges, because nothing can.",
        ],
      },
      {
        heading: "Why you don't get an API key",
        paragraphs: [
          "The naive design for an AI product is to hand every customer an API key and bill them for usage. TruffleTrade inverts this on purpose: subscribers get the interface and the intelligence; the Groq credentials live on our gateway and never appear in the app you download. If we shipped the key inside the client, it would be extractable by anyone who owned the files — that's not a hypothetical, it's how software works.",
          "So the local app authenticates to the gateway with your access code on every AI call. The gateway validates your subscription, applies a per-code rate limit, checks for abuse, and forwards the request to Groq. You never manage keys, you never pay inference bills, and one leaked customer machine can't burn anyone's API account.",
        ],
      },
      {
        heading: "Open source, anyway",
        paragraphs: [
          "Everything except the credentials is MIT-licensed and readable: the council, the fact-checker, the red team, the memory, the twin trainer, and the exact request path your data takes. A no-KYC product only earns trust by being auditable — so we publish the whole thing. The part you can't read is the part that costs money when copied, and even that you can watch on the wire: every call your app makes is visible, signed by nothing but your own access code.",
        ],
      },
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
