import { NextResponse } from "next/server";
import { z } from "zod";
import { softGuard, ecoCallerId } from "@/lib/guard";
import { ecoDb } from "@core/eco/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREATE = z.object({
  asset: z.string().max(12).optional().nullable(),
  belief: z.string().min(4).max(2000),
  reasoning: z.string().max(4000).optional().nullable(),
  evidence: z.array(z.string().max(400)).max(10).optional(),
  expectation: z.string().max(2000).optional().nullable(),
  invalidation: z.string().max(2000).optional().nullable(),
});

const OUTCOME = z.object({
  journalId: z.number().int().positive(),
  whatHappened: z.string().min(2).max(2000),
  differed: z.string().max(2000).optional(),
});

/** GET /api/eco/journal?asset= — decision journal entries (with outcomes). */
export async function GET(req: Request) {
  const denied = await softGuard(req);
  if (denied) return denied;
  const asset = new URL(req.url).searchParams.get("asset") ?? undefined;
  const entries = await ecoDb().listJournal(await ecoCallerId(req), { asset, limit: 100 });
  return NextResponse.json({ ok: true, entries });
}

/** POST /api/eco/journal — record a belief + reasoning. */
export async function POST(req: Request) {
  const denied = await softGuard(req);
  if (denied) return denied;
  const body = CREATE.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: body.error.issues[0]?.message ?? "invalid body" }, { status: 400 });
  }
  const b = body.data;
  const id = await ecoDb().createJournalEntry(await ecoCallerId(req), {
    asset: b.asset ?? null,
    belief: b.belief,
    reasoning: b.reasoning ?? null,
    evidence: b.evidence ?? [],
    expectation: b.expectation ?? null,
    invalidation: b.invalidation ?? null,
  });
  return NextResponse.json({ ok: true, id });
}

/** PATCH /api/eco/journal — record what actually happened for an entry. */
export async function PATCH(req: Request) {
  const denied = await softGuard(req);
  if (denied) return denied;
  const body = OUTCOME.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: body.error.issues[0]?.message ?? "invalid body" }, { status: 400 });
  }
  const ok = await ecoDb().addOutcome(await ecoCallerId(req), body.data.journalId, body.data.whatHappened, body.data.differed);
  if (!ok) return NextResponse.json({ ok: false, error: "entry not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
