import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, callerId } from "@/lib/guard";
import { ecoDb } from "@core/eco/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREATE = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

/** GET /api/eco/notes?limit= — research notes, newest first. */
export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  const notes = await ecoDb().listNotes(callerId(req), Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ ok: true, notes });
}

/** POST /api/eco/notes — save a research note. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const body = CREATE.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: body.error.issues[0]?.message ?? "invalid body" }, { status: 400 });
  }
  const id = await ecoDb().createNote(callerId(req), { title: body.data.title, body: body.data.body, tags: body.data.tags ?? [] });
  return NextResponse.json({ ok: true, id });
}
