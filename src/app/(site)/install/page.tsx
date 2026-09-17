import type { Metadata } from "next";
import Link from "next/link";

const REPO = "https://github.com/cameronorr2011-beep/TruffleTrade";
const DOWNLOAD = "/api/download/desktop";

export const metadata: Metadata = {
  title: "Install",
  description: "Download the free TruffleTrade desktop app for Windows, then activate TruffleTrade AI with your key.",
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
        The app is <strong className="text-ink">free</strong>. TruffleTrade AI (the analyst, the council, the digital
        twin) requires an activation key — 1,000 sats/month. Install, launch, activate, done.
      </p>

      {/* The only path most people need */}
      <section className="mt-10 rounded-xl border border-forest/30 bg-mint p-6">
        <h2 className="font-display text-[1.35rem] font-semibold text-ink">
          <span className="font-mono text-[0.8rem] text-truffle-300">WINDOWS ·</span> One-click install
        </h2>
        <ol className="mt-4 space-y-3 text-[0.92rem] leading-relaxed text-bone-soft">
          <li>
            <span className="font-bold text-forest">1.</span>{" "}
            <a href={DOWNLOAD} className="btn-primary mt-1 inline-block !py-2.5">
              ⬇ Download TruffleTrade-Setup.exe
            </a>{" "}
            — the download starts instantly, right here.
          </li>
          <li>
            <span className="font-bold text-forest">2.</span> Run the installer. The app installs like any Windows
            program — Start Menu entry, desktop shortcut, auto-start of its local research terminal.{" "}
            <strong className="text-ink">No Node.js, no command line.</strong>
          </li>
          <li>
            <span className="font-bold text-forest">3.</span> Launch <strong className="text-ink">TruffleTrade</strong>.
            Charts, watchlists and market data work immediately — the app is free.
          </li>
          <li>
            <span className="font-bold text-forest">4.</span> To unlock TruffleTrade AI: open{" "}
            <strong className="text-ink">AI Analyst</strong> → <strong className="text-ink">Enter activation key</strong>{" "}
            → paste the TT-… key from your purchase. No key yet? Get one at{" "}
            <Link href="/buy" className="text-forest underline">
              /buy
            </Link>{" "}
            — your code appears once your Bitcoin payment confirms (usually within minutes).
          </li>
        </ol>
        <p className="mt-4 text-[0.8rem] leading-relaxed text-bone-soft">
          Upgrading: just install the newest setup over the old one — your local data and activation are preserved.
          Uninstall any time from Windows Settings.
        </p>
      </section>

      <div className="mt-12 space-y-10">
        <section>
          <details>
            <summary className="cursor-pointer list-none">
              <h2 className="font-display inline text-[1.5rem] font-semibold text-ink">
                <span className="font-mono text-[0.8rem] text-truffle-300">ALT ·</span> Build from source
              </h2>
              <span className="ml-3 text-[0.8rem] font-semibold uppercase tracking-[0.6px] text-faint">
                for developers — click to expand
              </span>
            </summary>
            <p className="mt-3 text-[0.92rem] leading-relaxed text-bone-soft">
              You need Node.js 20+. The source is MIT-licensed on GitHub:
            </p>
            <Code>{`git clone ${REPO}.git truffletrade
cd truffletrade
npm install
npm run dev`}</Code>
            <p className="mt-3 text-[0.88rem] leading-relaxed text-bone-soft">
              The dev app serves itself at <code className="font-mono">http://localhost:3210</code> and connects to the
              same hosted gateway — your activation key works identically.
            </p>
          </details>
        </section>

        <section>
          <h2 className="font-display text-[1.5rem] font-semibold text-ink">
            <span className="font-mono text-[0.8rem] text-truffle-300">02 ·</span> How activation works
          </h2>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-bone-soft">
            Your access code is <strong>not</strong> a file you configure — the app asks for it once, verifies it with
            our gateway, and remembers it on this device. Nothing secret is ever stored in or extracted from the app:
            the gateway validates your subscription, rate-limits fairly, and holds the AI credentials on our side.
          </p>
          <Code>{`TruffleTrade AI · Premium Intelligence

  Enter your activation key

  [ TT-XXXX-XXXX-XXXX-XXXX ]   [ Activate ]

  ✓ AI ACTIVE · renews monthly · deactivate any time`}</Code>
          <p className="mt-3 text-[0.88rem] leading-relaxed text-bone-soft">
            Lost your key? Revisit your order page from the{" "}
            <Link href="/buy" className="text-truffle-300 underline decoration-truffle-400/40 underline-offset-2">
              buy page
            </Link>{" "}
            — codes are retrievable from the order that issued them.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[1.5rem] font-semibold text-ink">
            <span className="font-mono text-[0.8rem] text-truffle-300">03 ·</span> Verify and go
          </h2>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-bone-soft">
            Open <strong className="text-ink">AI Analyst</strong>, pick a ticker, and launch your first council
            investigation. If you ever see{" "}
            <code className="rounded bg-soil-800 px-1.5 py-0.5 font-mono text-[0.8rem] text-truffle-600">401</code> or
            the activation gate, your key expired — renew at /buy and paste the new code.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[1.5rem] font-semibold text-ink">
            <span className="font-mono text-[0.8rem] text-truffle-300">04 ·</span> Memory updates automatically
          </h2>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-bone-soft">
            The memory system consolidates every 6 hours while the app runs — no action needed. Federated learning (also
            automatic) only ever shares hashed, aggregated summaries: never raw content, never your watchlist.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="font-display text-[1.2rem] font-semibold text-ink">Troubleshooting</h2>
          <ul className="mt-4 space-y-3 text-[0.88rem] leading-relaxed text-bone-soft">
            <li>
              <span className="font-mono text-truffle-300">Windows SmartScreen warning</span> — expected for
              indie-published installers. Click “More info” → “Run anyway”. The binary is built reproducibly by our CI
              from the public repository.
            </li>
            <li>
              <span className="font-mono text-truffle-300">401 invalid access code</span> — check for typos; codes look
              like <code className="font-mono">TT-XXXX-XXXX-XXXX-XXXX</code> and are case-insensitive.
            </li>
            <li>
              <span className="font-mono text-truffle-300">402 subscription expired</span> — renew any time from the{" "}
              <Link href="/buy" className="text-truffle-300 underline decoration-truffle-400/40 underline-offset-2">
                buy page
              </Link>{" "}
              and paste the new code into the activation dialog.
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
