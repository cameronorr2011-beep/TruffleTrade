import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Install",
  description: "Install TruffleTrade from GitHub and connect it to your subscription with your access code.",
};

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg border border-soil-600  p-4 font-mono text-[0.78rem] leading-relaxed code-block text-truffle-600">
      {children}
    </pre>
  );
}

export default function InstallPage() {
  return (
    <div className="mx-auto max-w-[900px] px-5 py-20 sm:px-8">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300">Setup</span>
      <h1 className="font-display mt-5 text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-[1.05] text-ink">
        Install TruffleTrade
      </h1>
      <p className="mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-bone-soft">
        The whole product is open source. You install it from GitHub with a single clone, add the access code you got
        at purchase, and the AI brain runs on our gateway — no API keys of your own, ever.
      </p>

      <div className="mt-12 space-y-10">
        <section>
          <h2 className="font-display text-[1.5rem] font-semibold text-ink">
            <span className="font-mono text-[0.8rem] text-truffle-300">01 ·</span> Get the code
          </h2>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-bone-soft">
            You need Node.js 20+. Clone the repository from GitHub:
          </p>
          <Code>{`git clone https://github.com/cameronorr2011-beep/TruffleTrade.git truffletrade
cd truffletrade
npm install`}</Code>
        </section>

        <section>
          <h2 className="font-display text-[1.5rem] font-semibold text-ink">
            <span className="font-mono text-[0.8rem] text-truffle-300">02 ·</span> Add your access code
          </h2>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-bone-soft">
            Copy the environment template and set the gateway URL. Your access code is <strong>not</strong> put in files —
            the app asks for it once and remembers it on this device:
          </p>
          <Code>{`cp .env.example .env
# then edit .env:

TT_GATEWAY_URL=https://truffletrade.vercel.app

# run the app; when prompted, paste the code from your purchase:
#   TT-XXXX-XXXX-XXXX-XXXX`}</Code>
          <p className="mt-3 text-[0.88rem] leading-relaxed text-bone-soft">
            That&apos;s the only configuration a subscriber needs. The gateway validates your subscription, rate-limits
            fairly, and holds the AI credentials on our side — so there is nothing for you to maintain, and nothing for
            anyone to extract.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[1.5rem] font-semibold text-ink">
            <span className="font-mono text-[0.8rem] text-truffle-300">03 ·</span> Verify and run
          </h2>
          <Code>{`npm run verify          # checks your access code against the gateway
npm run dev             # the local app → http://localhost:3210`}</Code>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-bone-soft">
            Open <code className="rounded bg-soil-800 px-1.5 py-0.5 font-mono text-[0.8rem] text-truffle-600">/research</code>{" "}
            in the local app, type a ticker, and launch your first council investigation.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[1.5rem] font-semibold text-ink">
            <span className="font-mono text-[0.8rem] text-truffle-300">04 ·</span> Memory updates automatically
          </h2>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-bone-soft">
            The memory system consolidates every 6 hours while the app runs. To also train the digital twin and sync
            federated learning on a schedule (optional), run:
          </p>
          <Code>{`npm run memory:update`}</Code>
          <p className="mt-3 text-[0.88rem] leading-relaxed text-bone-soft">
            Point it at the gateway with the same access code to participate in federated learning. Only hashed,
            aggregated summaries ever leave your machine — never raw content, never your watchlist.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="font-display text-[1.2rem] font-semibold text-ink">Troubleshooting</h2>
          <ul className="mt-4 space-y-3 text-[0.88rem] leading-relaxed text-bone-soft">
            <li>
              <span className="font-mono text-truffle-300">401 invalid access code</span> — check for typos; codes look
              like <code className="font-mono">TT-XXXX-XXXX-XXXX-XXXX</code> and are case-insensitive.
            </li>
            <li>
              <span className="font-mono text-truffle-300">402 subscription expired</span> — renew any time from the{" "}
              <Link href="/buy" className="text-truffle-300 underline decoration-truffle-400/40 underline-offset-2">
                buy page
              </Link>{" "}
              and ask support to extend your code, or just use the new one.
            </li>
            <li>
              <span className="font-mono text-truffle-300">429 rate limit</span> — fair-use limit per code, resets every
              minute. Analysis runs are batched, so this is rare in normal use.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
