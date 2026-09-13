import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { getResearchRun } from "@core/research/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/research/:id — full audit trail for one run. Paid product output — gated. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: "invalid run id" }, { status: 400 });
  }
  const run = getResearchRun(numId);
  if (!run) return NextResponse.json({ ok: false, error: `run ${numId} not found` }, { status: 404 });
  return NextResponse.json({ ok: true, run });
}
