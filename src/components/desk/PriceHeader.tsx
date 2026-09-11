"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PriceHeader({ price, source, mode, cycleSeconds }: { price: number; source: string; mode: string; cycleSeconds: number }) {
  const router = useRouter();

  useEffect(() => {
    const iv = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(iv);
  }, [router]);

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[clamp(1.8rem,3.5vw,2.6rem)] font-semibold tracking-tight text-ink">
          The Desk
        </h1>
        <p className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.22em] text-bone-soft">
          BTC {price > 0 ? price.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—"} via {source} · mode {mode} · cycle {cycleSeconds}s
        </p>
      </div>
      <span className="flex items-center gap-2 rounded-full border border-jade/30 bg-jade/5 px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-jade">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-jade opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-jade" />
        </span>
        live · refreshes 30s
      </span>
    </div>
  );
}
