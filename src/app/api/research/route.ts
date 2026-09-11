import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/guard";
import { runResearch } from "@core/research/engine";
import { saveResearchRun, latestRunForTicker } from "@core/research/store";
import type { ResearchRun } from "@core/research/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  ticker: z.string().min(1).max(10).regex(/^[A-Za-z^.\-=]{1,10}$/),
  peers: z.array(z.string().max(10)).max(4).optional(),
});

let running = false;

/** POST /api/research — launch a full council investigation (guarded like /api/cycle). */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  if (running) {
    return NextResponse.json({ ok: false, error: "a research run is already in progress" }, { status: 409 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: `invalid ticker: ${parsed.error.issues[0]?.message}` }, { status: 400 });
  }
  const { ticker, peers } = parsed.data;
  running = true;
  try {
    const run = await runResearch({ ticker, peers: peers ?? [], depth: "standard" });
    const id = saveResearchRun(run);
    const saved: ResearchRun = { ...run, id };
    return NextResponse.json({ ok: true, runId: id, run: saved });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  } finally {
    running = false;
  }
}

/** GET /api/research — recent runs (optionally latest for a ticker). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = url.searchParams.get("ticker");
  if (ticker) {
    const run = latestRunForTicker(ticker);
    if (!run) return NextResponse.json({ ok: false, error: `no research runs for ${ticker}` }, { status: 404 });
    return NextResponse.json({ ok: true, run });
  }
  const { recentRuns } = await import("@core/research/store");
  return NextResponse.json({ ok: true, runs: recentRuns(40) });
}
