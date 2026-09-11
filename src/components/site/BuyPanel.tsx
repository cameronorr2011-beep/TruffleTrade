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
        QRCode.toDataURL(j.invoice, { width: 240, margin: 1, color: { dark: "#14231a", light: "#ffffff" } })
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
      <aside className="card p-7" id="your-code" style={{ borderColor: "#a6bf8a", boxShadow: "0 4px 24px rgba(33,88,62,0.1)" }}>
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1.2px] text-jade">
          <span aria-hidden className="live-dot" /> Payment confirmed
        </p>
        <h3 className="mt-2 text-[22px] font-bold tracking-[-0.8px] text-ink">Your TruffleTrade access code</h3>
        <button
          onClick={() => copy(accessCode, "code")}
          className="code-block mt-5 w-full px-4 py-4 text-[16px] font-semibold tracking-[0.12em] transition-colors hover:border-[#3a5a44]"
          title="Click to copy"
        >
          {accessCode}
          <span className="ml-3 text-[10px] uppercase tracking-[0.2em] text-[#8aa88f]">{copied === "code" ? "copied ✓" : "copy"}</span>
        </button>
        {exp && <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.6px] text-faint">Active through {exp} · no auto-renew</p>}

        <ol className="mt-6 space-y-4 text-[13px] leading-relaxed text-ink/85">
          <li>
            <span className="font-bold text-forest">1 · Get the app</span>
            <pre className="code-block mt-2 overflow-x-auto p-3 text-[11px] leading-relaxed">{`git clone https://github.com/cameronorr2011-beep/TruffleTrade.git truffletrade
cd truffletrade && npm install`}</pre>
          </li>
          <li>
            <span className="font-bold text-forest">2 · Add your code</span>
            <pre className="code-block mt-2 overflow-x-auto p-3 text-[11px] leading-relaxed">{`cp .env.example .env
# then set in .env:
TT_GATEWAY_URL=https://ai-stock-trader-two.vercel.app
TT_ACCESS_CODE=${accessCode}`}</pre>
          </li>
          <li>
            <span className="font-bold text-forest">3 · Run it</span>
            <pre className="code-block mt-2 overflow-x-auto p-3 text-[11px] leading-relaxed">{`npm run verify   # ✓ access active
npm run dev      # → http://localhost:3210`}</pre>
          </li>
        </ol>
        <a href="/install" className="btn-primary mt-6 inline-block">
          Full install guide
        </a>
        <p className="mt-3 text-[12px] leading-relaxed text-bone-soft">
          Keep this code — it&apos;s your license. You can retrieve it anytime from this page (bookmark the order link in
          your confirmation).
        </p>
      </aside>
    );
  }

  return (
    <aside className="card p-7">
      <h3 className="text-[19px] font-bold tracking-[-0.6px] text-ink">Buy in three steps</h3>
      {phase === "idle" && (
        <>
          <ol className="mt-5 space-y-3 text-[13px] text-bone-soft">
            <li>
              <span className="font-bold text-forest">1.</span> Click below — a Lightning invoice for{" "}
              <span className="font-semibold text-ink">1,000 sats</span> is generated just for you.
            </li>
            <li>
              <span className="font-bold text-forest">2.</span> Scan the QR or pay from any Lightning wallet (Wallet of
              Satoshi, Phoenix, Zeus…).
            </li>
            <li>
              <span className="font-bold text-forest">3.</span> Your access code + the app setup appear here the moment
              payment confirms — usually seconds.
            </li>
          </ol>
          <button onClick={startCheckout} className="btn-primary mt-7 w-full">
            Generate invoice
          </button>
          <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.8px] text-faint">
            No account. No email. No KYC.
          </p>
        </>
      )}

      {phase === "creating" && <p className="mt-6 animate-pulse text-[13px] font-semibold text-forest">Creating invoice…</p>}

      {phase === "awaiting" && invoice && (
        <div className="mt-5">
          <div className="flex flex-col items-center">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="Lightning invoice QR code" width={220} height={220} className="rounded-xl border border-soil-500" />
            ) : (
              <div className="flex h-[220px] w-[220px] items-center justify-center rounded-xl border border-soil-500 text-[11px] text-faint">
                generating QR…
              </div>
            )}
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[1px] text-forest">Scan with any Lightning wallet</p>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.6px] text-faint hover:text-bone-soft">
              Or copy the invoice text
            </summary>
            <div className="code-block mt-2 max-h-28 overflow-y-auto break-all p-3 text-[10px] leading-relaxed">{invoice}</div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => copy(invoice, "invoice")} className="btn-secondary !px-4 !py-2 !text-[11px]">
                {copied === "invoice" ? "Copied ✓" : "Copy"}
              </button>
              {lightningUri && (
                <a href={lightningUri} className="btn-primary !px-4 !py-2 !text-[11px]">
                  Open wallet
                </a>
              )}
            </div>
          </details>
          <p className="mt-4 flex items-center gap-2 animate-pulse text-[11.5px] font-semibold text-bone-soft">
            <span aria-hidden className="live-dot" /> Waiting for payment… this page confirms automatically
          </p>
          {orderId && <p className="mt-1 text-[10px] uppercase tracking-[0.6px] text-faint">Order {orderId}</p>}
        </div>
      )}

      {phase === "manual" && manual && (
        <div className="mt-5">
          <p className="text-[13px] leading-relaxed text-bone-soft">
            Send <span className="font-semibold text-ink">1,000 sats</span> to this Lightning address from any wallet
            (Wallet of Satoshi, Phoenix, Zeus…), then note your order id:
          </p>
          <button
            onClick={() => copy(manual.address, "address")}
            className="mt-3 w-full rounded-xl border border-forest/30 bg-mint px-4 py-3.5 text-left text-[14px] font-bold text-forest transition-colors hover:border-forest/60"
          >
            {manual.address}
            <span className="ml-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-forest/60">
              {copied === "address" ? "copied ✓" : "copy"}
            </span>
          </button>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.6px] text-faint">Your order id</p>
          <div className="code-block mt-1 break-all p-3 text-[11.5px]">{manual.orderId}</div>
          <ol className="mt-4 space-y-2 text-[12.5px] leading-relaxed text-bone-soft">
            <li>
              <span className="font-bold text-forest">1.</span> Pay the 1,000 sats (reference: your order id in the
              wallet note if your wallet supports notes).
            </li>
            <li>
              <span className="font-bold text-forest">2.</span> Your access code appears on this page as soon as the
              deposit is confirmed — usually within minutes.
            </li>
            <li>
              <span className="font-bold text-forest">3.</span> Keep this page open; it confirms automatically.
            </li>
          </ol>
          <p className="mt-4 flex items-center gap-2 animate-pulse text-[11.5px] font-semibold text-bone-soft">
            <span aria-hidden className="live-dot" /> Waiting for operator approval…
          </p>
          {orderId && <p className="mt-1 text-[10px] uppercase tracking-[0.6px] text-faint">Order {orderId}</p>}
        </div>
      )}

      {phase === "error" && (
        <div className="mt-5">
          <p className="text-[13px] text-blood">{error}</p>
          <button onClick={startCheckout} className="btn-secondary mt-4">
            Try again
          </button>
        </div>
      )}
    </aside>
  );
}
