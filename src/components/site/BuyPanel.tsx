"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

type Phase = "idle" | "creating" | "awaiting" | "manual" | "paid" | "error";

interface CheckoutResponse {
  ok: boolean;
  manual?: boolean;
  orderId?: string;
  invoice?: string | null;
  lightningUri?: string | null;
  priceSats?: number;
  lightningAddress?: string;
  error?: string;
}

interface StatusResponse {
  ok: boolean;
  status?: "pending" | "paid" | "issued" | "expired";
  accessCode?: string;
  expiresTs?: number;
  error?: string;
}

export default function BuyPanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [lightningUri, setLightningUri] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [expiresTs, setExpiresTs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"invoice" | "code" | "address" | null>(null);
  const [manual, setManual] = useState<{ address: string; orderId: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startCheckout = useCallback(async () => {
    setPhase("creating");
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = (await res.json()) as CheckoutResponse;
      if (!j.ok || !j.orderId) {
        throw new Error(j.error ?? "could not create invoice");
      }
      if (j.manual && j.lightningAddress) {
        setManual({ address: j.lightningAddress, orderId: j.orderId });
        setPhase("manual");
      } else {
        if (!j.invoice) throw new Error("no invoice returned");
        setInvoice(j.invoice);
        setLightningUri(j.lightningUri ?? null);
        setPhase("awaiting");
        QRCode.toDataURL(j.invoice, { width: 240, margin: 1, color: { dark: "#f4efe9", light: "#0a0806" } })
          .then(setQrDataUrl)
          .catch(() => setQrDataUrl(null));
      }
      setOrderId(j.orderId);
      // Both modes poll: ZBD confirms automatically; manual confirms when the
      // operator approves the order after seeing the WoS deposit.
      pollRef.current = setInterval(async () => {
        try {
          const s = await fetch(`/api/billing/status?orderId=${j.orderId}`);
          const sj = (await s.json()) as StatusResponse;
          if (sj.ok && sj.status === "issued") {
            if (pollRef.current) clearInterval(pollRef.current);
            setAccessCode(sj.accessCode ?? null);
            setExpiresTs(sj.expiresTs ?? null);
            setPhase("paid");
          }
        } catch {
          // transient — keep polling
        }
      }, 2_500);
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }, []);

  const copy = useCallback(async (text: string, what: "invoice" | "code" | "address") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1_500);
    } catch {
      // clipboard unavailable
    }
  }, []);

  if (phase === "paid" && accessCode) {
    const exp = expiresTs ? new Date(expiresTs).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
    return (
      <aside className="card border-truffle-400/40 p-7" id="your-code">
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-jade">Payment confirmed</p>
        <h3 className="font-display mt-2 text-[1.5rem] font-semibold text-bone">Your TruffleTrade access code</h3>
        <button
          onClick={() => copy(accessCode, "code")}
          className="mt-5 w-full rounded-xl border border-truffle-400/40 bg-void/80 px-4 py-4 font-mono text-[1.05rem] tracking-[0.14em] text-truffle-200 transition-colors hover:border-truffle-400/70"
          title="Click to copy"
        >
          {accessCode}
          <span className="ml-3 text-[0.6rem] uppercase tracking-[0.2em] text-bone/40">{copied === "code" ? "copied ✓" : "copy"}</span>
        </button>
        {exp && <p className="mt-2 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-bone/40">Active through {exp} · no auto-renew</p>}

        <ol className="mt-6 space-y-4 text-[0.9rem] leading-relaxed text-bone/70">
          <li>
            <span className="font-mono text-truffle-300">1 · Get the app</span>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-truffle-400/20 bg-void/70 p-3 font-mono text-[0.72rem] text-truffle-200/90">{`git clone https://github.com/cameronorr2011-beep/AI-STOCK-TRADER.git truffletrade
cd truffletrade && npm install`}</pre>
          </li>
          <li>
            <span className="font-mono text-truffle-300">2 · Add your code</span>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-truffle-400/20 bg-void/70 p-3 font-mono text-[0.72rem] text-truffle-200/90">{`cp .env.example .env
# then set in .env:
TT_GATEWAY_URL=https://truffletrade.vercel.app
TT_ACCESS_CODE=${accessCode}`}</pre>
          </li>
          <li>
            <span className="font-mono text-truffle-300">3 · Run it</span>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-truffle-400/20 bg-void/70 p-3 font-mono text-[0.72rem] text-truffle-200/90">{`npm run verify   # ✓ access active
npm run dev      # → http://localhost:3210`}</pre>
          </li>
        </ol>
        <a
          href="/install"
          className="mt-6 inline-block rounded-full bg-truffle-500 px-6 py-3 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-void transition-colors hover:bg-truffle-400"
        >
          Full install guide
        </a>
        <p className="mt-3 text-[0.75rem] leading-relaxed text-bone/45">
          Keep this code — it&apos;s your license. You can retrieve it anytime from this page (bookmark the order link in
          your confirmation).
        </p>
      </aside>
    );
  }

  return (
    <aside className="card p-7">
      <h3 className="font-display text-[1.3rem] font-semibold text-bone">Buy in three steps</h3>
      {phase === "idle" && (
        <>
          <ol className="mt-5 space-y-3 text-[0.9rem] text-bone/60">
            <li>
              <span className="font-mono text-truffle-300">1.</span> Click below — a Lightning invoice for{" "}
              <span className="text-bone">1,000 sats</span> is generated just for you.
            </li>
            <li>
              <span className="font-mono text-truffle-300">2.</span> Scan the QR or pay from any Lightning wallet (Wallet
              of Satoshi, Phoenix, Zeus…).
            </li>
            <li>
              <span className="font-mono text-truffle-300">3.</span> Your access code + the app setup appear here the
              moment payment confirms — usually seconds.
            </li>
          </ol>
          <button
            onClick={startCheckout}
            className="mt-7 w-full rounded-full bg-truffle-500 px-6 py-3.5 font-mono text-[0.72rem] uppercase tracking-[0.22em] text-void transition-colors hover:bg-truffle-400"
          >
            Generate invoice
          </button>
          <p className="mt-3 text-center font-mono text-[0.6rem] uppercase tracking-[0.18em] text-bone/35">
            No account. No email. No KYC.
          </p>
        </>
      )}

      {phase === "creating" && <p className="mt-6 animate-pulse font-mono text-[0.75rem] text-truffle-300">Creating invoice…</p>}

      {phase === "awaiting" && invoice && (
        <div className="mt-5">
          <div className="flex flex-col items-center">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="Lightning invoice QR code" width={220} height={220} className="rounded-xl border border-truffle-400/30" />
            ) : (
              <div className="flex h-[220px] w-[220px] items-center justify-center rounded-xl border border-truffle-400/30 font-mono text-[0.6rem] text-bone/40">
                generating QR…
              </div>
            )}
            <p className="mt-3 font-mono text-[0.66rem] uppercase tracking-[0.2em] text-truffle-300">Scan with any Lightning wallet</p>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer font-mono text-[0.62rem] uppercase tracking-[0.18em] text-bone/45 hover:text-bone/70">
              Or copy the invoice text
            </summary>
            <div className="mt-2 max-h-28 overflow-y-auto break-all rounded-lg border border-truffle-400/20 bg-void/60 p-3 font-mono text-[0.6rem] leading-relaxed text-truffle-200/70">
              {invoice}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => copy(invoice, "invoice")}
                className="rounded-full border border-truffle-400/40 px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-truffle-300 hover:bg-truffle-500/15"
              >
                {copied === "invoice" ? "Copied ✓" : "Copy"}
              </button>
              {lightningUri && (
                <a
                  href={lightningUri}
                  className="rounded-full bg-truffle-500 px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-void hover:bg-truffle-400"
                >
                  Open wallet
                </a>
              )}
            </div>
          </details>
          <p className="mt-4 animate-pulse font-mono text-[0.68rem] uppercase tracking-[0.18em] text-bone/50">
            Waiting for payment… this page confirms automatically
          </p>
          {orderId && <p className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-bone/25">Order {orderId}</p>}
        </div>
      )}

      {phase === "manual" && manual && (
        <div className="mt-5">
          <p className="text-[0.9rem] leading-relaxed text-bone/70">
            Send <span className="text-bone">1,000 sats</span> to this Lightning address from any wallet (Wallet of
            Satoshi, Phoenix, Zeus…), then note your order id:
          </p>
          <button
            onClick={() => copy(manual.address, "address")}
            className="mt-3 w-full rounded-xl border border-truffle-400/40 bg-void/80 px-4 py-3.5 text-left font-mono text-[0.95rem] text-truffle-200 transition-colors hover:border-truffle-400/70"
          >
            {manual.address}
            <span className="ml-3 text-[0.6rem] uppercase tracking-[0.2em] text-bone/40">
              {copied === "address" ? "copied ✓" : "copy"}
            </span>
          </button>
          <p className="mt-4 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-bone/45">Your order id</p>
          <div className="mt-1 break-all rounded-lg border border-truffle-400/20 bg-void/60 p-3 font-mono text-[0.72rem] text-truffle-200/90">
            {manual.orderId}
          </div>
          <ol className="mt-4 space-y-2 text-[0.85rem] leading-relaxed text-bone/60">
            <li>
              <span className="font-mono text-truffle-300">1.</span> Pay the 1,000 sats (reference: your order id in
              the wallet note if your wallet supports notes).
            </li>
            <li>
              <span className="font-mono text-truffle-300">2.</span> Your access code appears on this page as soon as
              the deposit is confirmed — usually within minutes.
            </li>
            <li>
              <span className="font-mono text-truffle-300">3.</span> Keep this page open; it confirms automatically.
            </li>
          </ol>
          <p className="mt-4 animate-pulse font-mono text-[0.68rem] uppercase tracking-[0.18em] text-bone/50">
            Waiting for operator approval…
          </p>
          {orderId && <p className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-bone/25">Order {orderId}</p>}
        </div>
      )}

      {phase === "error" && (
        <div className="mt-5">
          <p className="text-[0.9rem] text-blood">{error}</p>
          <button
            onClick={startCheckout}
            className="mt-4 rounded-full border border-bone/25 px-5 py-2.5 font-mono text-[0.66rem] uppercase tracking-[0.2em] text-bone/75 hover:border-bone/50"
          >
            Try again
          </button>
        </div>
      )}
    </aside>
  );
}
