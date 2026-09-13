"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StanceBadge from "./StanceBadge";
import { authHeaders, getAccessCode, setAccessCode } from "@/lib/accessCodeClient";

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

/**
 * In-app access-code dialog. Electron does not support window.prompt(), so
 * the code is collected here — styled to the dark workspace — and stored via
 * the same localStorage helper the site uses.
 */
function AccessCodeDialog({
  open,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue("");
      // Focus after paint so the dialog is mounted.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;
  return (
    <div className="tt-modal-scrim" role="dialog" aria-modal="true" aria-label="Access code required">
      <div className="tt-modal">
        <h3>Access code required</h3>
        <p>
          Investigations run on your subscription. Paste the access code from your purchase email
          — it stays on this device.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = value.trim().toUpperCase();
            if (v) onSubmit(v);
          }}
        >
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            placeholder="TT-XXXX-XXXX-XXXX-XXXX"
            spellCheck={false}
            aria-label="Access code"
          />
          <div className="tt-modal-actions">
            <button type="button" className="tt-btn tt-btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="tt-btn tt-btn-primary" disabled={!value.trim()}>
              Save &amp; run
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RunLauncher({ initialTicker, autorun }: { initialTicker: string; autorun: boolean }) {
  const router = useRouter();
  const [ticker, setTicker] = useState(initialTicker);
  const [peers, setPeers] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunPayload | null>(null);
  const [stage, setStage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingLaunch = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(false);

  const launch = useCallback(
    async (codeArg?: string) => {
      const t = ticker.trim().toUpperCase();
      if (!t || busy) return;
      setBusy(true);
      setError(null);
      setResult(null);
      setStage(0);
      timer.current = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 6000);
      try {
        let code = codeArg ?? getAccessCode();
        if (!code) {
          // No stored code → open the in-app dialog (Electron-safe) and bail;
          // the dialog re-enters launch() with the collected code.
          pendingLaunch.current = true;
          setBusy(false);
          setDialogOpen(true);
          return;
        }
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(), ...(codeArg ? { "x-access-code": codeArg } : {}) },
          signal: AbortSignal.timeout(6 * 60_000),
          body: JSON.stringify({
            ticker: t,
            peers: peers
              .split(/[\s,]+/)
              .map((p) => p.trim().toUpperCase())
              .filter(Boolean)
              .slice(0, 4),
          }),
        });
        // The server can answer without a parseable body (crash, proxy error,
        // stale process). Blind res.json() is what produced the cryptic
        // "Unexpected end of JSON input" — parse defensively instead.
        const payload = (await res.json().catch(() => null)) as RunPayload | null;
        if (!payload) {
          if (res.status === 401 || res.status === 403) {
            try { localStorage.removeItem("tt-access-code"); } catch { /* ignore */ }
            pendingLaunch.current = true;
            setDialogOpen(true);
          }
          setError(
            res.status === 503
              ? "The subscription gateway is briefly unavailable — wait a few seconds and run again."
              : `Investigation service error (HTTP ${res.status || "no response"}). If this persists, restart the app.`,
          );
          return;
        }
        if (!payload.ok) {
          // A rejected code (401/403) must not stay cached — clear and ask again.
          if (res.status === 401 || res.status === 403) {
            try { localStorage.removeItem("tt-access-code"); } catch { /* ignore */ }
            pendingLaunch.current = true;
            setDialogOpen(true);
          }
          setError(payload.error ?? "research run failed");
        } else {
          if (codeArg) setAccessCode(codeArg);
          setResult(payload);
        }
      } catch (e) {
        const err = e as Error;
        setError(
          err.name === "TimeoutError" || err.name === "AbortError"
            ? "The investigation ran too long and was stopped. Data providers may be slow right now — try again."
            : err.message,
        );
      } finally {
        if (timer.current) clearInterval(timer.current);
        setBusy(false);
      }
    },
    [ticker, peers, busy],
  );

  const handleDialogSubmit = useCallback(
    (code: string) => {
      setDialogOpen(false);
      setAccessCode(code);
      pendingLaunch.current = false;
      void launch(code);
    },
    [launch],
  );

  useEffect(() => {
    if (autorun && initialTicker && !started.current) {
      started.current = true;
      void launch();
    }
  }, [autorun, initialTicker, launch]);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  return (
    <section className="card mt-8 p-6">
      <AccessCodeDialog
        open={dialogOpen}
        onSubmit={handleDialogSubmit}
        onCancel={() => {
          setDialogOpen(false);
          pendingLaunch.current = false;
          setError("An active subscription is required to run investigations.");
        }}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void launch();
        }}
        className="flex flex-wrap items-end gap-4"
      >
        <div>
          <label htmlFor="ticker" className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-faint">
            Ticker
          </label>
          <input
            id="ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="NVDA"
            maxLength={10}
            className="mt-2 w-36 rounded-lg border border-soil-500 bg-white px-4 py-2.5 font-mono text-[1rem] uppercase text-ink outline-none focus:border-forest/50"
          />
        </div>
        <div className="min-w-[240px] flex-1">
          <label htmlFor="peers" className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-faint">
            Peer set (optional, up to 4)
          </label>
          <input
            id="peers"
            value={peers}
            onChange={(e) => setPeers(e.target.value.toUpperCase())}
            placeholder="AMD AVGO INTC"
            className="mt-2 w-full rounded-lg border border-soil-500 bg-white px-4 py-2.5 font-mono text-[0.9rem] text-ink outline-none focus:border-forest/50 placeholder:text-faint"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !ticker.trim()}
          className="rounded-full bg-truffle-500 px-6 py-2.5 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-white transition-colors hover:bg-truffle-600 disabled:opacity-40"
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
                i < stage ? "text-jade" : i === stage ? "text-truffle-300" : "text-faint"
              }`}
            >
              <span>{i < stage ? "✓" : i === stage ? "▸" : "·"}</span>
              {s}
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p className="mt-6 rounded-lg border border-blood/30 bg-[#faf1ec] p-4 font-mono text-[0.75rem] text-blood">
          {error}
        </p>
      )}

      {result?.ok && result.run && (
        <div className="mt-6 rounded-xl border border-jade/25 bg-jade/5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <StanceBadge stance={result.run.consensus.stance} />
            <span className="font-mono text-[0.7rem] text-bone-soft">
              score {result.run.consensus.score >= 0 ? "+" : ""}
              {result.run.consensus.score.toFixed(2)}
              {result.run.consensus.redTeamVeto ? " · RED TEAM REJECT" : ""}
            </span>
          </div>
          <p className="mt-3 text-[0.88rem] leading-relaxed text-bone-soft">{result.run.thesis.summary}</p>
          <a
            href={`/research/${result.runId}`}
            className="mt-4 inline-block rounded-full border border-forest/35 px-5 py-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-truffle-600 hover:bg-truffle-200/60"
          >
            Open full dossier
          </a>
        </div>
      )}
    </section>
  );
}
