import { NextResponse } from "next/server";
import { getResearchRun } from "@core/research/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/research/:id — full audit trail for one run. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: "invalid run id" }, { status: 400 });
  }
  const run = getResearchRun(numId);
  if (!run) return NextResponse.json({ ok: false, error: `run ${numId} not found` }, { status: 404 });
  return NextResponse.json({ ok: true, run });
}
