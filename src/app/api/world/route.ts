import { NextResponse } from "next/server";
import { worldNewsRadar } from "@core/research/marketIntelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 5 * 60_000;
let cache: { at: number; data: unknown } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ ok: true, cached: true, ...(cache.data as object) });
  }
  try {
    const items = await worldNewsRadar(18);
    const data = { items, fetchedAt: Date.now() };
    cache = { at: Date.now(), data };
    return NextResponse.json({ ok: true, cached: false, ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `world news unavailable: ${(e as Error).message}` }, { status: 502 });
  }
}
