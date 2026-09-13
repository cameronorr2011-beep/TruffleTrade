import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { buildSignalCard } from "@core/research/signal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 15 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();

/**
 * GET /api/signal?ticker=NVDA — the Signal Card: deterministic verdict from a
 * weighted evidence panel plus the AI adversarial debate (fail-closed to
 * NO TRADE). Paid product surface — subscription-gated.
 */
export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const ticker = (url.searchParams.get("ticker") ?? "").trim().toUpperCase().slice(0, 12);
  const ai = url.searchParams.get("ai") !== "0";
  if (!/^[A-Z0-9.\-^=]{1,12}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "invalid ticker" }, { status: 400 });
  }

  const key = `${ticker}:${ai ? "ai" : "det"}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ok: true, cached: true, card: hit.data });
  }

  try {
    // The caller's own code (header-verified by guard) drives the AI call —
    // no env fallback; a keyless install behaves exactly like a customer's.
    const card = await buildSignalCard(ticker, ai, req.headers.get("x-access-code") ?? undefined);
    cache.set(key, { at: Date.now(), data: card });
    return NextResponse.json({ ok: true, cached: false, card });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `signal unavailable: ${(e as Error).message}` }, { status: 502 });
  }
}
