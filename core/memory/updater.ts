// The memory auto-update loop — "the memory that updates regularly".
// Can run in three modes:
//   - interval (setInterval) inside a long-running process (engine / gateway dev server)
//   - one-shot via CLI (`npm run memory:update`) — cron/Task Scheduler friendly
//   - imported and awaited by API routes

import {
  consolidate,
  getLastAutoUpdateTs,
  memoryStats,
  recordRegime,
  runMemoryUpdate,
  setLastAutoUpdateTs,
} from "./memory";
import { calibrateTwin, trainTwin } from "./twin";
import { buildOutboundBatch, peerHash, pushFederatedUpdate } from "./federated";

export interface MemoryUpdateOptions {
  twinPaths?: number;
  horizonDays?: number;
  federate?: boolean;
  gatewayUrl?: string;
  accessCode?: string;
  machineId?: string;
}

export interface MemoryUpdateReport {
  ranAt: number;
  merged: number;
  totalFacts: number;
  twinPathsRun: number;
  federatedPush?: { accepted: boolean; error?: string };
  nextRunInMs?: number;
}

export const MEMORY_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

/** One memory update cycle: replay the twin, consolidate facts, optionally federate. */
export async function runFullMemoryUpdate(opts: MemoryUpdateOptions = {}): Promise<MemoryUpdateReport> {
  const ranAt = Date.now();
  const twinPaths = opts.twinPaths ?? 500;
  const horizonDays = opts.horizonDays ?? 20;

  // 1) Twin replay on the default subject bundle (macro + SPY proxy).
  let twinPathsRun = 0;
  try {
    const closes = await macroCloses();
    if (closes.length >= 30) {
      const cal = calibrateTwin(closes, "bootstrap");
      const { facts } = trainTwin(cal, { paths: twinPaths, horizonDays, seed: Math.floor(ranAt / 86_400_000), subject: "SPY" });
      const volPct = cal.sigmaDaily * 100;
      const regimeKey = volPct > 3 ? "high-vol" : "calm";
      recordRegime("SPY", regimeKey, volPct, cal.muDaily * 100 * 20, ranAt, "twin:bootstrap");
      for (const f of facts) {
        const { reinforceSimilar } = await import("./memory");
        reinforceSimilar({ kind: "analyst_insight", subject: "SPY", content: f, confidence: 0.6, createdAt: ranAt, source: "twin:bootstrap" });
      }
      twinPathsRun = twinPaths;
    }
  } catch {
    // No network / no data — memory update continues with consolidation only.
  }

  // 2) Consolidation + bookkeeping.
  const { merged, stats } = runMemoryUpdate();

  // 3) Federated push (opt-out via FEDERATION_DISABLED=1).
  let federatedPush: MemoryUpdateReport["federatedPush"];
  if (opts.federate && process.env.FEDERATION_DISABLED !== "1") {
    if (opts.gatewayUrl && opts.accessCode) {
      const batch = buildOutboundBatch();
      if (batch.tokens > 0) {
        federatedPush = await pushFederatedUpdate(
          { gatewayUrl: opts.gatewayUrl, accessCode: opts.accessCode },
          batch,
        );
      }
    }
  }

  return {
    ranAt,
    merged,
    totalFacts: stats.totalFacts,
    twinPathsRun,
    federatedPush,
  };
}

/** Macro closes for twin calibration: SPY daily, keyless Yahoo endpoint. */
async function macroCloses(): Promise<number[]> {
  const res = await fetch(
    "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=6mo&interval=1d",
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; TruffleTrade/1.0)" }, signal: AbortSignal.timeout(15_000), cache: "no-store" },
  );
  if (!res.ok) return [];
  const j = (await res.json()) as {
    chart?: { result?: { indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
  };
  const closes: (number | null)[] = j.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  return closes.filter((c): c is number => c != null);
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start the periodic updater (long-running processes only). */
export function startMemoryUpdater(opts: MemoryUpdateOptions & { intervalMs?: number } = {}): void {
  if (timer) return;
  const intervalMs = opts.intervalMs ?? MEMORY_UPDATE_INTERVAL_MS;
  // Catch-up: if the last update is stale, run once shortly after boot.
  const last = getLastAutoUpdateTs();
  const stale = Date.now() - last > intervalMs;
  timer = setInterval(() => {
    void runFullMemoryUpdate(opts).catch(() => {});
  }, intervalMs);
  if (stale) {
    setTimeout(() => {
      void runFullMemoryUpdate(opts).catch(() => {});
    }, 30_000);
  }
}

export function stopMemoryUpdater(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

// ── CLI: `npm run memory:update` ──────────────────────────────────────────
// Not executed on import — only when invoked as the entry module.
if (process.argv[1] && process.argv[1].endsWith("updater.ts")) {
  // CLI entry only: load .env so gatewayUrl/accessCode are present when run
  // by hand or by schedulers. Never runs on plain import (instrumentation).
  // Sync require — this file compiles to CJS, so top-level await is unavailable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config();
  const gatewayUrl = process.env.TT_GATEWAY_URL?.trim() || undefined;
  const accessCode = process.env.TT_ACCESS_CODE?.trim() || undefined;
  runFullMemoryUpdate({
    twinPaths: 500,
    horizonDays: 20,
    federate: Boolean(gatewayUrl && accessCode),
    gatewayUrl,
    accessCode,
    machineId: peerHash(process.env.TT_MACHINE_ID?.trim() || "local"),
  })
    .then((r) => {
      console.log("[memory:update]", JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[memory:update] failed:", (err as Error).message);
      process.exit(1);
    });
}
