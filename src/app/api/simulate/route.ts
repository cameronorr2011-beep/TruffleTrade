import { NextResponse } from "next/server";
import { runSimulation } from "@core/research/simulate";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();

export async function GET(req: Request) {
  // Paid product intelligence — the twin replay is what subscribers pay for.
  const denied = await guard(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const ticker = (url.searchParams.get("ticker") ?? "").trim().toUpperCase().slice(0, 12);
  const days = Math.min(90, Math.max(5, Number(url.searchParams.get("days") ?? 20)));
  if (!/^[A-Z0-9.\-^=]{1,12}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "invalid ticker" }, { status: 400 });
  }

  const key = `${ticker}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ok: true, cached: true, ...(hit.data as object) });
  }

  try {
    const sim = await runSimulation(ticker, days);
    const data = { sim };
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json({ ok: true, cached: false, ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `simulation unavailable: ${(e as Error).message}` }, { status: 502 });
  }
}
