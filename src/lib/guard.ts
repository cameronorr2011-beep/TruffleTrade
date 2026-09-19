import { NextResponse } from "next/server";

import { validateAccessCode, validateWithAbuseTracking, checkRateLimit } from "@core/licensing/validate";
import { hashCode } from "@core/licensing/codes";
import { isLockedOut, recordFailure, pruneFailures } from "@core/licensing/abuse";
import { clientIp } from "@/lib/client-ip";

/**
 * Gate for endpoints that burn paid AI (research runs, cycles, halt).
 *
 * Two modes:
 *  1. DASHBOARD_TOKEN set   → operator mode: requests must carry x-desk-token.
 *  2. Otherwise (default)   → subscription mode: requests MUST present a
 *     valid, unexpired access code via the x-access-code header. There is
 *     deliberately NO server-side env fallback: a keyless local install must
 *     behave exactly like a customer's machine (the in-app dialog collects
 *     the code once; it rides on every gated call from localStorage).
 *
 * This closes the free-ride hole: the public deployment must never let
 * anonymous visitors trigger Groq calls. Live market DATA (keyless Yahoo)
 * stays free by design — only intelligence is metered.
 *
 * Abuse hardening: repeated invalid codes from one IP are recorded in the
 * licensing store (Postgres on Vercel) and trip a persistent lockout — see
 * core/licensing/abuse.ts (threshold + window live there).
 */
export async function guard(req: Request): Promise<NextResponse | null> {
  try {
    return await checkGuard(req);
  } catch {
    // The license/audit store being unreachable (e.g. a stale database socket)
    // must fail CLOSED with a parseable JSON response — never an unhandled
    // exception (which Next.js answers with an empty-body 500 that crashes
    // client res.json()). 503 denies access and tells the client to retry.
    return NextResponse.json(
      { ok: false, error: "subscription service temporarily unavailable — retry shortly", code: "GATEWAY_UNAVAILABLE" },
      { status: 503, headers: { "retry-after": "30" } },
    );
  }
}

async function checkGuard(req: Request): Promise<NextResponse | null> {
  const operatorToken = process.env.DASHBOARD_TOKEN?.trim();
  if (operatorToken) {
    if (req.headers.get("x-desk-token") !== operatorToken) {
      return NextResponse.json({ ok: false, error: "invalid or missing x-desk-token" }, { status: 401 });
    }
    return null;
  }

  // Subscription mode. Anonymous callers and headerless requests are rejected here.
  const ip = clientIp(req);

  // Brute-force lockout (persistent across deploys — Postgres/SQLite store).
  if (await isLockedOut(ip)) {
    return NextResponse.json(
      { ok: false, error: "too many failed attempts — access denied temporarily", code: "LOCKED_OUT" },
      { status: 429, headers: { "retry-after": String(Math.ceil(15 * 60)) } },
    );
  }

  const presented = req.headers.get("x-access-code") ?? "";
  const validation = await validateWithAbuseTracking(presented, ip);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error ?? "subscription required", code: validation.lockedOut ? "LOCKED_OUT" : "SUBSCRIPTION_REQUIRED" },
      { status: validation.status },
    );
  }
  const rl = checkRateLimit(validation.codeHash!);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate limit exceeded — retry shortly", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(Math.ceil(rl.resetMs / 1000)) } },
    );
  }
  void pruneFailures; // opportunistic cleanup happens via recordFailure paths
  return null;
}

/**
 * Resolve the caller's identity WITHOUT re-validating (call right after
 * `guard()` returned null). Operator mode falls back to a stable "operator"
 * id; otherwise the caller's code hash — the same id used to scope all
 * eco_* tables. Never log or expose the plaintext code.
 */
export function callerId(req: Request): string {
  const presented = req.headers.get("x-access-code") ?? "";
  const operatorToken = process.env.DASHBOARD_TOKEN?.trim();
  if (operatorToken && req.headers.get("x-desk-token") === operatorToken) return "operator";
  if (presented.trim()) return hashCode(presented);
  return "operator";
}
