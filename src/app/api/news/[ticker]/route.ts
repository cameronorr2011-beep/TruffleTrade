import { NextResponse } from "next/server";
import { resolveNews } from "@core/data/plugins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 5 * 60_000; // headlines refresh every 5 minutes

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).trim().toUpperCase().slice(0, 12);
  if (!/^[A-Z0-9.\-^=]{1,12}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "invalid ticker" }, { status: 400 });
  }

  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ok: true, cached: true, ticker, ...(hit.data as object) });
  }

  const r = await resolveNews(ticker, 12);
  if (!r.ok || r.news.length === 0) {
    return NextResponse.json(
      { ok: false, error: r.ok ? "no headlines" : `news unavailable (${r.reason})` },
      { status: 502 },
    );
  }

  const payload = {
    items: r.news.map((n) => ({
      title: n.title,
      source: n.source,
      link: n.link,
      publishedTs: n.publishedAt,
      ageMin: Math.max(0, Math.round((Date.now() - n.publishedAt) / 60_000)),
    })),
    count: r.news.length,
    provider: r.provider,
    fetchedAt: r.retrievedAt,
  };
  cache.set(ticker, { at: Date.now(), data: payload });
  return NextResponse.json({ ok: true, cached: false, ticker, ...payload });
}
