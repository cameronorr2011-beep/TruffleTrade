// Subscription validation + abuse protection for the gateway.
// Every gateway call presents an access code; the server checks:
//   1. checksum (unforgeable)  2. DB record (active, not expired, not revoked)
//   3. per-code rate limit (in-memory sliding window, per server instance)

import { hashCode, verifyAccessCode } from "./codes";
import { licensingDb } from "./db";
import { recordFailure } from "./abuse";

export interface ValidationResult {
  ok: boolean;
  status: number;
  error?: string;
  codeHash?: string;
  expiresTs?: number;
}

const DEFAULT_RATE_LIMIT = 60; // requests per window per code
const WINDOW_MS = 60_000;

const buckets = new Map<string, number[]>();

export function rateLimitConfig(): { limit: number; windowMs: number } {
  const raw = process.env.GATEWAY_RATE_LIMIT_PER_MIN?.trim();
  const parsed = raw ? Number(raw) : NaN;
  // Empty string, garbage, zero, or negative all fall back to the default.
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RATE_LIMIT;
  return { limit, windowMs: WINDOW_MS };
}

/** Per-code sliding-window rate limiter (in-memory, resets on redeploy — fine for abuse control). */
export function checkRateLimit(codeHash: string): { ok: boolean; remaining: number; resetMs: number } {
  const { limit, windowMs } = rateLimitConfig();
  const now = Date.now();
  let hits = buckets.get(codeHash);
  if (!hits) {
    hits = [];
    buckets.set(codeHash, hits);
  }
  while (hits.length && now - hits[0] > windowMs) hits.shift();
  if (hits.length >= limit) {
    const rawReset = hits.length ? windowMs - (now - hits[0]) : windowMs;
    const resetMs = Number.isFinite(rawReset) && rawReset > 0 ? rawReset : windowMs;
    return { ok: false, remaining: 0, resetMs: Math.max(100, Math.min(resetMs, windowMs)) };
  }
  hits.push(now);
  return { ok: true, remaining: limit - hits.length, resetMs: windowMs };
}

export interface GuardedValidationResult extends ValidationResult {
  lockedOut?: boolean;
}

/**
 * validateAccessCode + persistent brute-force protection.
 *
 * Failures that indicate guessing (malformed or unknown codes) are recorded
 * per-IP in the abuse store; once an IP crosses the threshold inside the
 * rolling window, every further attempt from it is denied with 429 until the
 * window clears — even between deploys (the store is Postgres/SQLite, not
 * memory). Known-state failures of REAL codes (revoked → 403, expired → 402)
 * are deliberately NOT counted: the presenter already holds the code, so
 * punishing those attempts would only lock out subscribers.
 */
export async function validateWithAbuseTracking(raw: string, ip: string | null): Promise<GuardedValidationResult> {
  const result = await validateAccessCode(raw);
  // An ABSENT code is not brute force — it's a logged-out user (the desktop
  // app probes /verify before activation on every gated page, all from
  // 127.0.0.1). Recording those failures locked single-user installs out of
  // their own gateway. Only a PRESENTED-but-wrong code counts as guessing.
  if (result.ok || !ip || !raw.trim()) return result;
  if (result.status === 401) {
    try {
      const { locked } = await recordFailure(ip, raw);
      if (locked) {
        return {
          ok: false,
          status: 429,
          error: "too many failed attempts — access denied temporarily",
          lockedOut: true,
        };
      }
    } catch {
      // Abuse store unreachable — fail open to the plain validation result
      // rather than locking out everyone on a database hiccup.
    }
  }
  return result;
}

export async function validateAccessCode(raw: string): Promise<ValidationResult> {
  const code = verifyAccessCode(raw);
  if (!code) {
    return { ok: false, status: 401, error: "invalid access code format" };
  }
  const hash = hashCode(code);
  const row = await licensingDb().getCode(hash);
  if (!row) {
    return { ok: false, status: 401, error: "unknown access code" };
  }
  const now = Date.now();
  if (row.status !== "active") {
    return { ok: false, status: 403, error: "access code revoked" };
  }
  if (row.expiresTs <= now) {
    return { ok: false, status: 402, error: "subscription expired — renew at truffletrade.app/buy" };
  }
  return { ok: true, status: 200, codeHash: hash, expiresTs: row.expiresTs };
}
