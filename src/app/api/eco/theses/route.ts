import { NextResponse } from "next/server";
import { z } from "zod";
import { softGuard, callerId } from "@/lib/guard";
import { ecoDb } from "@core/eco/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREATE = z.object({
  asset: z.string().min(1).max(12),
  claim: z.string().min(8).max(2000),
  timeHorizon: z.string().max(60).optional().nullable(),
  supportingEvidence: z.array(z.string().max(400)).max(10).optional(),
  counterarguments: z.array(z.string().max(400)).max(10).optional(),
  keyRisks: z.array(z.string().max(400)).max(10).optional(),
  invalidationConditions: z.array(z.string().max(400)).max(10).optional(),
  confidence: z.number().int().min(0).max(100).optional().nullable(),
  status: z.enum(["active", "validated", "invalidated", "retired"]).optional(),
});

/** GET /api/eco/theses?asset=&status= — the user's investment theses. */
export async function GET(req: Request) {
  const denied = await softGuard(req);
  if (denied) return denied;
  const db = ecoDb();
  const url = new URL(req.url);
  const asset = url.searchParams.get("asset") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const theses = await db.listTheses(callerId(req), { asset, status, limit: 100 });
  return NextResponse.json({ ok: true, theses });
}

/** POST /api/eco/theses — create a thesis. */
export async function POST(req: Request) {
  const denied = await softGuard(req);
  if (denied) return denied;
  const body = CREATE.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: body.error.issues[0]?.message ?? "invalid body" }, { status: 400 });
  }
  const b = body.data;
  const id = await ecoDb().createThesis(callerId(req), {
    asset: b.asset,
    claim: b.claim,
    timeHorizon: b.timeHorizon ?? null,
    supportingEvidence: b.supportingEvidence ?? [],
    counterarguments: b.counterarguments ?? [],
    keyRisks: b.keyRisks ?? [],
    invalidationConditions: b.invalidationConditions ?? [],
    confidence: b.confidence ?? null,
    status: b.status ?? "active",
  });
  return NextResponse.json({ ok: true, id });
}
