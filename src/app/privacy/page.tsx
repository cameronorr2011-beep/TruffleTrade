import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What TruffleTrade collects (very little), what stays on your device (almost everything), and why.",
};

const SECTIONS: { heading: string; paras: string[] }[] = [
  {
    heading: "Summary",
    paras: [
      "TruffleTrade is local-first: the software runs on your machine, your research data and memory live in databases on your disk, and we never see your watchlist, your notes, or your analyses. We collect no account information because there are no accounts. This policy explains the small set of exceptions.",
    ],
  },
  {
    heading: "Who we are",
    paras: [
      "TruffleTrade is an independent software product operated by its author (\"TruffleTrade\", \"we\"). Contact: the GitHub repository's issues page at github.com/cameronorr2011-beep/AI-STOCK-TRADER — support and privacy requests are handled there.",
    ],
  },
  {
    heading: "What we collect when you buy access",
    paras: [
      "Payments run through ZBD (Zebedee), a Lightning Network payment processor. When you pay, ZBD processes the payment and we receive: a charge identifier, the amount, and the payment status. We do not receive, ask for, or store your name, email, address, or any identity documents. There is no KYC for the product itself.",
      "We store an order record (random order id, charge id, status, timestamps) and a hash of your access code. Access codes are stored only as cryptographic hashes — the plaintext code exists only in the moment of issuance.",
    ],
  },
  {
    heading: "What the app sends to our gateway",
    paras: [
      "When the app analyzes a chart, it sends the analysis request (ticker and computed data-pack context) to our gateway together with your access code. The gateway forwards the request to our AI provider (Groq) and returns the result. We log request counts per access code for rate limiting and abuse prevention.",
      "We do not sell this data, we do not build advertising profiles, and we do not retain the content of your analyses on our servers beyond transient processing.",
    ],
  },
  {
    heading: "Federated learning",
    paras: [
      "If you leave federated learning enabled, the app periodically sends a privacy-preserving summary: counts of memory-fact kinds keyed by cryptographically hashed subjects. Raw content, tickers, watchlists, notes, and outcomes are never included — the hash cannot be reversed to your data by us or anyone else. You can disable participation entirely by setting FEDERATION_DISABLED=1 in your .env.",
    ],
  },
  {
    heading: "Cookies",
    paras: [
      "This website uses strictly-necessary cookies only, unless you opt in to more: a consent record (your cookie choice) and a purchase session so the buy flow can confirm payment. Optional analytics, if accepted, are anonymous and stored on-device. We embed no advertising or cross-site tracking scripts. You can withdraw consent at any time by clearing site data; the banner will reappear.",
    ],
  },
  {
    heading: "What stays on your device",
    paras: [
      "Everything else: the SQLite ledger of your research runs, your thesis history, forecast audits, your memory database, and the digital-twin calibration data. If you delete the data directory, it's gone — we have no copy and cannot recover it.",
    ],
  },
  {
    heading: "AI processing disclosure",
    paras: [
      "Analysis requests are processed by Groq, Inc. (our inference provider) on our behalf. We send the minimum context needed for the analysis. Prompts instruct the model to treat retrieved market content as data, not instructions. We do not send your identity (we don't have one) with any request.",
    ],
  },
  {
    heading: "Your rights",
    paras: [
      "Because we hold almost nothing, there is almost nothing to export or erase. For the records we do hold (order + code hash), you may request deletion by opening an issue on the repository and quoting your order id — though note that deleting the order record revokes access. GDPR/CCPA requests are answered from this same minimal dataset.",
    ],
  },
  {
    heading: "Changes",
    paras: [
      "If this policy changes materially, the updated version will be published here with a new effective date. Continued use after changes means acceptance. Effective date: September 10, 2026.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[760px] px-5 py-20 sm:px-8">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/80">Legal</span>
      <h1 className="font-display mt-5 text-[clamp(2.2rem,5vw,3.4rem)] font-semibold leading-[1.05] text-bone">
        Privacy Policy
      </h1>
      <div className="mt-10 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.heading}>
            <h2 className="font-display text-[1.35rem] font-semibold text-truffle-200">{s.heading}</h2>
            {s.paras.map((p, i) => (
              <p key={i} className="mt-3 text-[0.94rem] leading-[1.75] text-bone/70">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
