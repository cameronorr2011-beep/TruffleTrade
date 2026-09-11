import { NextResponse } from "next/server";
import { googleNews } from "@core/research/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 5 * 60_000; // headlines refresh every 5 minutes

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).trim().toUpperCase().slice(0, 12);
  if (!/^[A-Z0-9.\-^=]{1,12}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "invalid ticker" }, { status: 400 });
  }

  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ok: true, cached: true, ticker, ...(hit.data as object) });
  }

  try {
    const items = await googleNews(ticker, 12);
    const payload = {
      items: items.map((n) => ({
        title: n.title,
        source: n.source,
        link: n.link,
        publishedTs: n.publishedTs,
        ageMin: n.publishedTs ? Math.max(0, Math.round((Date.now() - n.publishedTs) / 60_000)) : null,
      })),
      count: items.length,
      fetchedAt: Date.now(),
    };
    cache.set(ticker, { at: Date.now(), data: payload });
    return NextResponse.json({ ok: true, cached: false, ticker, ...payload });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `news unavailable: ${(e as Error).message}` }, { status: 502 });
  }
}
