import { NextResponse } from "next/server";
import { rankPeers } from "@core/research/peers";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();

export async function GET(req: Request) {
  // Paid product intelligence — gated like the AI routes.
  const denied = await guard(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const ticker = (url.searchParams.get("ticker") ?? "").trim().toUpperCase().slice(0, 12);
  if (!/^[A-Z0-9.\-^=]{1,12}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "invalid ticker" }, { status: 400 });
  }

  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ok: true, cached: true, ...(hit.data as object) });
  }

  try {
    const ranking = await rankPeers(ticker);
    const data = { ranking };
    cache.set(ticker, { at: Date.now(), data });
    return NextResponse.json({ ok: true, cached: false, ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `peer ranking failed: ${(e as Error).message}` }, { status: 500 });
  }
}
