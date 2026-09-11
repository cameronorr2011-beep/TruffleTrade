"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "creating" | "awaiting" | "paid" | "error";

interface CheckoutResponse {
  ok: boolean;
  orderId?: string;
  invoice?: string | null;
  lightningUri?: string | null;
  priceSats?: number;
  error?: string;
}

interface StatusResponse {
  ok: boolean;
  status?: "pending" | "paid" | "issued" | "expired";
  error?: string;
}

export default function BuyPanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [lightningUri, setLightningUri] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
      if (!j.ok || !j.invoice || !j.orderId) {
        throw new Error(j.error ?? "could not create invoice");
      }
      setInvoice(j.invoice);
      setLightningUri(j.lightningUri ?? null);
      setOrderId(j.orderId);
      setPhase("awaiting");
      pollRef.current = setInterval(async () => {
        try {
          const s = await fetch(`/api/billing/status?orderId=${j.orderId}`);
          const sj = (await s.json()) as StatusResponse;
          if (sj.ok && (sj.status === "issued" || sj.status === "paid")) {
            if (pollRef.current) clearInterval(pollRef.current);
            setPhase("paid");
          }
        } catch {
          // transient — keep polling
        }
      }, 3_000);
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }, []);

  const copy = useCallback(async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      // clipboard unavailable
    }
  }, [invoice]);

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
              <span className="font-mono text-truffle-300">2.</span> Pay from any Lightning wallet (Wallet of Satoshi,
              Phoenix, Zeus…).
            </li>
            <li>
              <span className="font-mono text-truffle-300">3.</span> Your access code appears here the moment payment
              confirms — usually seconds.
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
          <p className="text-[0.85rem] text-bone/60">Pay this invoice with any Lightning wallet:</p>
          <div className="mt-3 break-all rounded-lg border border-truffle-400/20 bg-void/60 p-3 font-mono text-[0.62rem] leading-relaxed text-truffle-200/80">
            {invoice}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={copy}
              className="rounded-full border border-truffle-400/40 px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-truffle-300 hover:bg-truffle-500/15"
            >
              {copied ? "Copied ✓" : "Copy invoice"}
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
          <p className="mt-4 animate-pulse font-mono text-[0.68rem] uppercase tracking-[0.18em] text-bone/50">
            Waiting for payment… (this page confirms automatically)
          </p>
          {orderId && <p className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-bone/25">Order {orderId}</p>}
        </div>
      )}

      {phase === "paid" && (
        <div className="mt-5">
          <p className="font-display text-[1.4rem] font-semibold text-truffle-300">Payment confirmed ◆</p>
          <p className="mt-3 text-[0.9rem] leading-relaxed text-bone/65">
            Welcome to TruffleTrade. Your 30-day access starts now. Head to{" "}
            <a href="/install" className="text-truffle-300 underline decoration-truffle-400/40 underline-offset-2">
              Install
            </a>{" "}
            to set up the app with the access code shown in your payment confirmation.
          </p>
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
