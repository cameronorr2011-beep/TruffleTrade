import { NextResponse } from "next/server";
import { validateWithAbuseTracking } from "@core/licensing/validate";
import { isLockedOut } from "@core/licensing/abuse";
import { clientIp } from "@/lib/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gateway/verify — the local app pings this at startup with its
 * access code. Per-IP sliding-window rate limit: a valid code is 16
 * unguessable chars (60 bits + HMAC checksum), but online guessing should be
 * expensive regardless. Buckets are in-memory per server instance, which is
 * sufficient for abuse control (multi-instance deployments can add a shared
 * store later without changing the contract).
 */
const LIMIT = Number(process.env.VERIFY_RATE_LIMIT_PER_MIN ?? 30) || 30;
const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  let hits = buckets.get(ip);
  if (!hits) {
    hits = [];
    buckets.set(ip, hits);
  }
  while (hits.length && now - hits[0] > WINDOW_MS) hits.shift();
  if (hits.length >= LIMIT) return true;
  hits.push(now);
  // opportunistic cleanup of stale buckets
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] > WINDOW_MS) buckets.delete(k);
    }
  }
  return false;
}

export async function GET(req: Request) {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "too many verification attempts — retry in a minute" },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }
  // Persistent brute-force lockout — survives deploys (Postgres/SQLite store).
  if (await isLockedOut(ip)) {
    return NextResponse.json(
      { ok: false, error: "too many failed attempts — access denied temporarily" },
      { status: 429, headers: { "retry-after": String(Math.ceil(15 * 60)) } },
    );
  }
  const code = req.headers.get("x-access-code") ?? "";
  const v = await validateWithAbuseTracking(code, ip);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: v.status });
  }
  return NextResponse.json({
    ok: true,
    product: "TruffleTrade",
    expiresTs: v.expiresTs,
    daysRemaining: v.expiresTs ? Math.max(0, Math.ceil((v.expiresTs - Date.now()) / 86_400_000)) : 0,
  });
}
