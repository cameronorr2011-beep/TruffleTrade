"use client";

import { useEffect, useState } from "react";

export default function WatchButton({ ticker }: { ticker: string }) {
  const [state, setState] = useState<"loading" | "on" | "off">("loading");

  useEffect(() => {
    let alive = true;
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((j: { ok: boolean; items?: { ticker: string }[] }) => {
        if (alive && j.ok && j.items?.some((i) => i.ticker === ticker)) setState("on");
        else if (alive) setState("off");
      })
      .catch(() => alive && setState("off"));
    return () => {
      alive = false;
    };
  }, [ticker]);

  const toggle = async () => {
    if (state === "loading") return;
    const next = state === "on" ? "off" : "on";
    setState("loading");
    try {
      if (next === "on") {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker }),
        });
      } else {
        await fetch(`/api/watchlist?ticker=${encodeURIComponent(ticker)}`, { method: "DELETE" });
      }
      setState(next);
    } catch {
      setState(state);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={state === "loading"}
      className={`rounded-full border px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.2em] transition-colors disabled:opacity-40 ${
        state === "on"
          ? "border-forest/55 bg-truffle-200/60 text-truffle-600"
          : "border-soil-500 text-bone-soft hover:border-forest/45 hover:text-ink"
      }`}
    >
      {state === "on" ? "★ Watching" : "☆ Watch"}
    </button>
  );
}
