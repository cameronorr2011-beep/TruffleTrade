import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { validateAccessCode, validateWithAbuseTracking, checkRateLimit } from "@core/licensing/validate";
import type { Awaitable } from "@core/eco/store";
import { hashCode } from "@core/licensing/codes";
import { isLockedOut, recordFailure, pruneFailures } from "@core/licensing/abuse";
import { clientIp } from "@/lib/client-ip";

/**
 * The x-forwarded-for value Vercel's edge injects on every request. Its mere
 * PRESENCE means the caller came through a proxy — i.e. the public internet.
 * A direct local call from the user's own machine carries no such header.
 */
const LOOPBACKS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * True when the request originates from the operator's own machine. Two
 * independent gates (both must hold), because Next.js itself injects
 * x-forwarded-for on local requests:
 *
 *  1. The LAST hop of x-forwarded-for is loopback. Proxies append the real
 *     client IP, so a spoofed "x-forwarded-for: ::1" from the public internet
 *     still ends with the attacker's real address at the last position.
 *  2. The Host header is localhost/loopback — a public request can never
 *     legitimately carry it (DNS resolves the domain, not loopback).
 *
 * Used ONLY to waive the access code for the user's personal eco data on
 * their own hardware — never for AI, licensing, or research endpoints.
 * Set TT_LOCAL_OPERATOR=0 to disable.
 */
export function isLocalOperator(req: Request): boolean {
  if (process.env.TT_LOCAL_OPERATOR?.trim() === "0") return false;

  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (host !== "localhost" && !LOOPBACKS.has(host)) return false;

  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
  const lastHop = hops[hops.length - 1] ?? "";
  if (hops.length > 0 && !LOOPBACKS.has(lastHop)) return false;

  // No x-forwarded-for at all: trust the socket-derived ip (direct local call).
  const ip = clientIp(req) || "";
  return hops.length === 0 ? LOOPBACKS.has(ip) || ip === "unknown" : true;
}

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
  // Loopback operator: local requests without a code get one stable identity
  // so their theses/journal/notes persist across sessions on this machine.
  if (isLocalOperator(req) && !presented.trim()) return "local-operator";
  if (presented.trim()) return hashCode(presented);
  return "operator";
}

/**
 * Guard for PERSONAL-DATA eco endpoints (theses, journal, notes, learning,
 * insights). My Intelligence is FREE for everyone:
 *   · desktop app (loopback) → stable "local-operator" identity
 *   · valid access code      → the subscriber's normal identity
 *   · everyone else          → an anonymous cookie identity (own private space,
 *                              no code, no signup)
 * AI-burning routes keep `guard()` (or freemiumGuard below).
 */
const ECO_COOKIE = "tt-eco-id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hasValidCode(req: Request): Promise<boolean> {
  const presented = req.headers.get("x-access-code") ?? "";
  if (!presented.trim()) return false;
  try {
    return (await validateAccessCode(presented)).ok;
  } catch {
    return false; // store unreachable → treat as anonymous rather than 503-ing a free feature
  }
}

export async function softGuard(req: Request): Promise<NextResponse | null> {
  if (isLocalOperator(req)) return null;
  if (await hasValidCode(req)) return null;
  // Anonymous: ensure a durable cookie identity exists, then allow.
  try {
    const jar = await cookies();
    const existing = jar.get(ECO_COOKIE)?.value ?? "";
    if (!UUID_RE.test(existing)) {
      jar.set(ECO_COOKIE, crypto.randomUUID(), {
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }
  } catch {
    // cookies unavailable (e.g. prerender) → allow without identity
  }
  return null;
}

/**
 * Identity for eco data — MUST be awaited after softGuard (the cookie is set
 * during the guard call). Same resolution order as softGuard so every route
 * scoping agrees: local-operator → code hash → anon cookie id.
 */
export async function ecoCallerId(req: Request): Promise<string> {
  if (isLocalOperator(req)) return "local-operator";
  const presented = req.headers.get("x-access-code") ?? "";
  if (presented.trim()) return hashCode(presented);
  try {
    const jar = await cookies();
    const id = jar.get(ECO_COOKIE)?.value ?? "";
    if (UUID_RE.test(id)) return `anon-${id}`;
  } catch {
    // fall through
  }
  return "anon-unknown";
}

/**
 * Freemium guard for Black Truffle + Learn (the AI features inside My
 * Intelligence). White Truffle (AI Analyst) remains subscription-only via
 * `guard()`. Free tier: 5 successful AI sessions per day per identity; a
 * valid access code is unlimited; the operator's own machine is unlimited.
 * The caller records usage AFTER a successful generation via recordAiUse().
 */
export async function freemiumGuard(req: Request, db: { countAiToday: (u: string, k: string) => Awaitable<number> }, kind: string): Promise<NextResponse | null> {
  if (isLocalOperator(req)) return null;
  if (await hasValidCode(req)) return null;
  const used = await db.countAiToday(await ecoCallerId(req), kind);
  if (used >= FREE_AI_SESSIONS_PER_DAY) {
    return NextResponse.json(
      {
        ok: false,
        code: "FREEMIUM_LIMIT",
        error: `Free limit reached — ${FREE_AI_SESSIONS_PER_DAY} Truffle sessions per day. Subscribe (1,000 sats/month) for unlimited White + Black Truffle.`,
      },
      { status: 402 },
    );
  }
  return null;
}

export const FREE_AI_SESSIONS_PER_DAY = 5;

/** Record one successful freemium AI session (call only after generation worked). */
export async function recordAiUse(req: Request, db: { recordAiUse: (u: string, k: string) => Awaitable<void> }, kind: string): Promise<void> {
  if (isLocalOperator(req)) return;
  const presented = req.headers.get("x-access-code") ?? "";
  if (presented.trim()) return; // subscribers don't consume the free quota
  try {
    await db.recordAiUse(await ecoCallerId(req), kind);
  } catch {
    // usage accounting is best-effort — never break the response
  }
}
