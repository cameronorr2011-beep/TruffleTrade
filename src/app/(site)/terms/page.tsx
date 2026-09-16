import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using TruffleTrade: age requirement, what the product does and does not do, billing, and disclaimers.",
};

const SECTIONS: { heading: string; paras: string[] }[] = [
  {
    heading: "1. Agreement",
    paras: [
      "By purchasing access to or using TruffleTrade (the \"Software\"), you agree to these Terms. If you do not agree, do not use the Software. The Software is licensed, not sold, to you under these Terms; the source code itself is additionally available under the MIT License in the public repository.",
    ],
  },
  {
    heading: "2. Age requirement — 18+ or parental consent",
    paras: [
      "You must be at least 18 years old to purchase and use TruffleTrade. If you are between 13 and 17, a parent or legal guardian must review these Terms, complete the purchase on your behalf, consent to your use, and supervise that use. The Software is a powerful analytical tool about real financial markets and is not designed for unsupervised use by minors.",
      "By purchasing, you represent and warrant that one of the above is true.",
    ],
  },
  {
    heading: "3. What TruffleTrade is",
    paras: [
      "TruffleTrade is research and analysis software: it uses AI models to analyze market data, produce structured investment research with stated assumptions, versioned theses, and audited forecast history, and maintain a local learning memory trained partly on digital-twin simulations.",
      "TruffleTrade is not a broker, not an exchange, not a financial adviser, and does not execute, route, or automate any trades. It has no ability to move money, place orders, or connect to your brokerage. All trading decisions and executions are yours alone, performed through your own broker.",
    ],
  },
  {
    heading: "4. Not investment advice",
    paras: [
      "All output is informational and educational. Nothing the Software produces is a recommendation, solicitation, or offer to buy or sell any security. AI-generated analysis can be wrong, incomplete, or stale; forecasts are audited against reality including misses. You are solely responsible for verifying anything the Software tells you before acting on it, and for consulting licensed professionals where appropriate.",
    ],
  },
  {
    heading: "5. Billing — 1,000 sats per 30 days",
    paras: [
      "Access costs 1,000 satoshis (0.00001 BTC) per 30-day period, paid in full in Bitcoin on-chain via our payment processor (Blockonomics). Access begins when the Bitcoin network confirms your payment (2 confirmations) and ends 30 days later. There is no auto-renewal, no recurring charge, and no stored payment method — renewal is a deliberate new payment by you.",
      "Because Bitcoin payments are irreversible and the product is delivered immediately (access code issuance), all sales are final once a payment confirms and a code is issued. If a payment fails or an order expires, no charge occurs. Contact us via the GitHub repository if a confirmed payment did not yield a working code.",
    ],
  },
  {
    heading: "6. Acceptable use",
    paras: [
      "You may not: share, resell, or publish your access code; attempt to extract the gateway's AI credentials; bypass rate limits; use the Software to violate securities law, market-abuse rules, or sanctions; or use the output to operate an advisory service for others. We may revoke access codes that violate these Terms, without refund for time already delivered.",
    ],
  },
  {
    heading: "7. No warranty",
    paras: [
      "The Software is provided \"as is\" and \"as available\" without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Software will be uninterrupted, accurate, or error-free. Availability of the AI gateway depends on third-party providers.",
    ],
  },
  {
    heading: "8. Limitation of liability",
    paras: [
      "To the maximum extent permitted by law, TruffleTrade's aggregate liability arising out of or relating to the Software is limited to the amount you paid in the 30 days preceding the claim. We are not liable for trading losses, lost profits, or any indirect, incidental, consequential, or punitive damages. You alone are responsible for your capital, your taxes, and compliance with your local laws.",
    ],
  },
  {
    heading: "9. Termination",
    paras: [
      "You may stop using the Software at any time. We may suspend or revoke access for violation of these Terms. Sections 4, 7, and 8 survive termination.",
    ],
  },
  {
    heading: "10. Changes and governing terms",
    paras: [
      "We may update these Terms; the current version lives at this page with its effective date. Material changes will be noted on the site. Effective date: September 10, 2026.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-[760px] px-5 py-20 sm:px-8">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/80">Legal</span>
      <h1 className="font-display mt-5 text-[clamp(2.2rem,5vw,3.4rem)] font-semibold leading-[1.05] text-ink">
        Terms of Service
      </h1>
      <div className="mt-10 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.heading}>
            <h2 className="font-display text-[1.35rem] font-semibold text-truffle-600">{s.heading}</h2>
            {s.paras.map((p, i) => (
              <p key={i} className="mt-3 text-[0.94rem] leading-[1.75] text-bone-soft">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
