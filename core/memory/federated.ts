// Federated learning for TruffleTrade Memory.
// Installations periodically push privacy-preserving memory updates (hashed
// subjects, kind counts only) and pull the aggregated, normalized global
// weights. No raw content, no tickers, no user identity ever leaves a device.

import crypto from "node:crypto";
import { exportFederatedBatch, getLastAutoUpdateTs, type FederatedBatch } from "./memory";

export interface FederatedPullResponse {
  epoch: number;
  aggregated: {
    subjectHash: string;
    kindCounts: Record<string, number>;
    weight: number; // normalized share of the global update
  }[];
  peers: number;
}

export interface FederatedClientConfig {
  gatewayUrl: string; // e.g. https://truffletrade.vercel.app
  accessCode: string;
}

export interface FederatedPushResult {
  accepted: boolean;
  error?: string;
  nextEpoch?: number;
}

/** Peer hash: HMAC of a stable machine id — peers are pseudonymous. */
export function peerHash(machineId: string): string {
  return crypto.createHmac("sha256", "tt-peer").update(machineId).digest("hex").slice(0, 16);
}

export async function pushFederatedUpdate(cfg: FederatedClientConfig, batch: FederatedBatch): Promise<FederatedPushResult> {
  try {
    const res = await fetch(`${cfg.gatewayUrl.replace(/\/$/, "")}/api/federation/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-code": cfg.accessCode },
      body: JSON.stringify({ epoch: batch.epoch, tokens: batch.tokens, batches: batch.batches }),
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; epoch?: number };
    if (!res.ok || !j.ok) return { accepted: false, error: j.error ?? `HTTP ${res.status}` };
    return { accepted: true, nextEpoch: j.epoch };
  } catch (err) {
    return { accepted: false, error: (err as Error).message };
  }
}

export async function pullFederatedWeights(cfg: FederatedClientConfig): Promise<FederatedPullResponse | { error: string }> {
  try {
    const res = await fetch(`${cfg.gatewayUrl.replace(/\/$/, "")}/api/federation/pull`, {
      headers: { "x-access-code": cfg.accessCode },
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await res.json().catch(() => ({}))) as FederatedPullResponse & { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) return { error: j.error ?? `HTTP ${res.status}` };
    return { epoch: j.epoch, aggregated: j.aggregated ?? [], peers: j.peers ?? 0 };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** Build the outbound batch since the last successful sync (falls back to last 7 days). */
export function buildOutboundBatch(): FederatedBatch {
  const since = getLastAutoUpdateTs() || Date.now() - 7 * 86_400_000;
  return exportFederatedBatch(since);
}
