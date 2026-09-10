"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StanceBadge from "./StanceBadge";

interface RunPayload {
  ok: boolean;
  runId?: number;
  error?: string;
  run?: {
    status: string;
    consensus: { stance: string; score: number; synthesis: string; redTeamVeto: boolean };
    thesis: { summary: string };
    errors: string[];
  };
}

const STAGES = [
  "Fetching market data + provenance",
  "Computing valuation models (DCF / reverse-DCF / comps)",
  "Six analysts investigating independently",
  "Fact-checking every numeric claim",
  "Red team cross-examination",
  "Synthesizing consensus + thesis",
];

export default function RunLauncher({ initialTicker, autorun }: { initialTicker: string; autorun: boolean }) {
  const router = useRouter();
  const [ticker, setTicker] = useState(initialTicker);
  const [peers, setPeers] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunPayload | null>(null);
  const [stage, setStage] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(false);

  const launch = useCallback(async () => {
    const t = ticker.trim().toUpperCase();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setStage(0);
    timer.current = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 6000);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: t,
          peers: peers
            .split(/[\s,]+/)
            .map((p) => p.trim().toUpperCase())
            .filter(Boolean)
            .slice(0, 4),
        }),
      });
      const payload = (await res.json()) as RunPayload;
      if (!payload.ok) setError(payload.error ?? "research run failed");
      else setResult(payload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (timer.current) clearInterval(timer.current);
      setBusy(false);
    }
  }, [ticker, peers, busy]);

  useEffect(() => {
    if (autorun && initialTicker && !started.current) {
      started.current = true;
      void launch();
    }
  }, [autorun, initialTicker, launch]);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  return (
    <section className="card mt-8 p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void launch();
        }}
        className="flex flex-wrap items-end gap-4"
      >
        <div>
          <label htmlFor="ticker" className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-bone/45">
            Ticker
          </label>
          <input
            id="ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="NVDA"
            maxLength={10}
            className="mt-2 w-36 rounded-lg border border-pit-300/25 bg-void/60 px-4 py-2.5 font-mono text-[1rem] uppercase text-bone outline-none focus:border-ember-400/60"
          />
        </div>
        <div className="min-w-[240px] flex-1">
          <label htmlFor="peers" className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-bone/45">
            Peer set (optional, up to 4)
          </label>
          <input
            id="peers"
            value={peers}
            onChange={(e) => setPeers(e.target.value.toUpperCase())}
            placeholder="AMD AVGO INTC"
            className="mt-2 w-full rounded-lg border border-pit-300/25 bg-void/60 px-4 py-2.5 font-mono text-[0.9rem] text-bone outline-none focus:border-ember-400/60 placeholder:text-bone/25"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !ticker.trim()}
          className="rounded-full bg-ember-500 px-6 py-2.5 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-void transition-colors hover:bg-ember-400 disabled:opacity-40"
        >
          {busy ? "Investigating…" : "Run investigation"}
        </button>
      </form>

      {busy && (
        <ol className="mt-6 space-y-2">
          {STAGES.map((s, i) => (
            <li
              key={s}
              className={`flex items-center gap-3 font-mono text-[0.72rem] ${
                i < stage ? "text-jade" : i === stage ? "text-ember-300" : "text-bone/30"
              }`}
            >
              <span>{i < stage ? "✓" : i === stage ? "▸" : "·"}</span>
              {s}
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p className="mt-6 rounded-lg border border-blood/40 bg-blood/10 p-4 font-mono text-[0.75rem] text-bone/80">
          {error}
        </p>
      )}

      {result?.ok && result.run && (
        <div className="mt-6 rounded-xl border border-jade/25 bg-jade/5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <StanceBadge stance={result.run.consensus.stance} />
            <span className="font-mono text-[0.7rem] text-bone/55">
              score {result.run.consensus.score >= 0 ? "+" : ""}
              {result.run.consensus.score.toFixed(2)}
              {result.run.consensus.redTeamVeto ? " · RED TEAM REJECT" : ""}
            </span>
          </div>
          <p className="mt-3 text-[0.88rem] leading-relaxed text-bone/75">{result.run.thesis.summary}</p>
          <a
            href={`/research/${result.runId}`}
            className="mt-4 inline-block rounded-full border border-ember-400/40 px-5 py-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ember-200 hover:bg-ember-500/15"
          >
            Open full dossier
          </a>
        </div>
      )}
    </section>
  );
}
