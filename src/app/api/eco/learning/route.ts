import { NextResponse } from "next/server";
import { z } from "zod";
import { softGuard, ecoCallerId } from "@/lib/guard";
import { ecoDb } from "@core/eco/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECORD = z.object({
  topic: z.string().min(1).max(60),
  lesson: z.string().min(1).max(4000),
  quizScore: z.number().int().min(0).max(100).optional().nullable(),
});

/** GET /api/eco/learning — progress by topic. */
export async function GET(req: Request) {
  const denied = await softGuard(req);
  if (denied) return denied;
  const progress = await ecoDb().lessonProgress(await ecoCallerId(req));
  return NextResponse.json({ ok: true, progress });
}

/** POST /api/eco/learning — record a completed lesson (+ optional quiz score). */
export async function POST(req: Request) {
  const denied = await softGuard(req);
  if (denied) return denied;
  const body = RECORD.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: body.error.issues[0]?.message ?? "invalid body" }, { status: 400 });
  }
  await ecoDb().recordLesson(await ecoCallerId(req), {
    topic: body.data.topic,
    lesson: body.data.lesson,
    quizScore: body.data.quizScore ?? null,
    completedAt: Date.now(),
  });
  return NextResponse.json({ ok: true });
}
