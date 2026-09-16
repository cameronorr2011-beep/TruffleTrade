import type { Metadata } from "next";
import Link from "next/link";
import BuyPanel from "@/components/site/BuyPanel";

export const metadata: Metadata = {
  title: "Get access",
  description: "Pay 1,000 sats in Bitcoin on-chain for 30 days of TruffleTrade. No account, no KYC.",
};

export default function BuyPage() {
  return (
    <div className="mx-auto max-w-[900px] px-5 py-20 sm:px-8">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300">Checkout</span>
      <h1 className="font-display mt-5 text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-[1.05] text-bone">
        Thirty days of TruffleTrade
      </h1>
      <p className="mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-bone-soft">
        One Bitcoin payment of <span className="text-bone">1,000 sats</span> (0.00001 BTC, on-chain). No account creation, no email, no
        identity verification. Your access code is issued the moment payment confirms.
      </p>

      <div className="mt-8 rounded-xl border border-soil-500 bg-mint p-5">
        <p className="text-[0.85rem] leading-relaxed text-bone-soft">
          <strong className="text-truffle-600">Age requirement:</strong> by purchasing you confirm you are 18 or older —
          or that a parent or guardian has reviewed and approved this purchase and will supervise your use of the
          product. See the{" "}
          <Link href="/terms" className="text-truffle-300 underline decoration-truffle-400/40 underline-offset-2">
            Terms
          </Link>{" "}
          for details.
        </p>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <BuyPanel />
        <div className="card p-7">
          <h3 className="font-display text-[1.2rem] font-semibold text-bone">What you get</h3>
          <ul className="mt-4 space-y-3 text-[0.9rem] text-bone-soft">
            {[
              "Unlimited AI chart analyses on any ticker",
              "Six-analyst council with fact-checker and red team",
              "Versioned theses with audited forecast history",
              "Local memory system that updates itself",
              "Federated learning across all installations",
              "Runs on your machine — your data stays local",
            ].map((f) => (
              <li key={f} className="flex gap-3">
                <span aria-hidden className="text-truffle-400">◆</span>
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-6 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-faint">
            Analysis software · not investment advice · no trade execution
          </p>
        </div>
      </div>
    </div>
  );
}
