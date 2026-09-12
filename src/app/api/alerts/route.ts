import { NextResponse } from "next/server";
import { evaluateTicker, detectCatalysts } from "@core/alerts";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TICKERS = 8;
const TTL_MS = 60_000;

const cache = new Map<string, { at: number; data: unknown }>();

export async function GET(req: Request) {
  // Alerts are part of the paid product (and polling hammers the free
  // providers) — subscription-gated like the AI routes. The local desktop
  // app passes automatically via its server-side TT_ACCESS_CODE.
  const denied = await guard(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const raw = (url.searchParams.get("tickers") ?? "").toUpperCase();
  if (!raw.trim()) {
    return NextResponse.json({ ok: false, error: "tickers query param required" }, { status: 400 });
  }
  const tickers = [...new Set(raw.split(",").map((t) => t.trim().replace(/\s+/g, "")).filter(Boolean))]
    .filter((t) => /^[A-Z0-9.\-^=]{1,12}$/.test(t))
    .slice(0, MAX_TICKERS);
  if (tickers.length === 0) {
    return NextResponse.json({ ok: false, error: "no valid tickers" }, { status: 400 });
  }

  const key = tickers.join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ok: true, cached: true, ...(hit.data as object) });
  }

  try {
    const evaluations = await Promise.all(tickers.map((t) => evaluateTicker(t)));
    const catalysts = await Promise.all(tickers.map((t) => detectCatalysts(t)));
    const data = {
      results: evaluations,
      catalysts: catalysts.map((c, i) => ({ ticker: tickers[i], items: c })),
      evaluatedAt: Date.now(),
    };
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json({ ok: true, cached: false, ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `alert evaluation failed: ${(e as Error).message}` }, { status: 500 });
  }
}
