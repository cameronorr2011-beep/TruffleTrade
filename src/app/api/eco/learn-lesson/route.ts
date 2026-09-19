import { NextResponse } from "next/server";
import { z } from "zod";
import { freemiumGuard, recordAiUse, ecoCallerId } from "@/lib/guard";
import { makeProvider } from "@core/research/ai";
import { ecoDb } from "@core/eco/store";

const AI_KIND = "learn";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BODY = z.object({ topic: z.string().min(1).max(60) });

const KNOWN = [
  "Market basics", "Chart reading", "Technical analysis", "Fundamentals", "Financial statements",
  "Risk", "Portfolio construction", "Macroeconomics", "Quantitative analysis", "Behavioral finance",
];

/**
 * POST /api/eco/learn-lesson — generate one lesson + quick-check questions,
 * adapted to the user's recorded learning progress. Freemium: 5 lessons/day
 * free, unlimited with a subscription (or on the operator's own machine).
 */
export async function POST(req: Request) {
  const db = ecoDb();
  const denied = await freemiumGuard(req, db, AI_KIND);
  if (denied) return denied;
  const body = BODY.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "invalid topic" }, { status: 400 });

  let provider;
  try {
    provider = makeProvider();
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }

  const userId = await ecoCallerId(req);
  const topic = body.data.topic;
  const progress = await db.lessonProgress(userId);

  const strong = progress.filter((p) => (p.bestScore ?? 0) >= 70).map((p) => p.topic);
  const weak = progress.filter((p) => (p.bestScore ?? 0) < 70).map((p) => p.topic);
  const adaptation =
    progress.length === 0
      ? "The learner is new: define every term on first use."
      : `Already strong (use freely, no definitions needed): ${strong.join(", ") || "none"}. Struggling (re-explain simply if related): ${weak.join(", ") || "none"}.`;

  try {
    const res = await provider.chatJson<{ lesson?: string; markdown?: string; questions?: { q?: string; a?: string }[] }>(
      [
        {
          role: "system",
          content:
            "You are TruffleTrade's financial tutor. Write a compact lesson (180-260 words, plain English, concrete examples, no hype, no advice to buy/sell) " +
            `on the topic: "${topic}". ${adaptation}\n` +
            'Then write 3 quick-check questions. Respond ONLY as JSON: {"lesson": string, "questions": [{"q": string, "a": string}]} ' +
            'where each "a" is a SHORT canonical answer (1-5 words) so answers can be auto-graded.',
        },
        { role: "user", content: `Teach: ${topic}` },
      ],
      "learn-lesson-v1",
      1200,
      { temperature: 0.4 },
    );
    const questions = (res.data.questions ?? [])
      .filter((q) => q?.q)
      .slice(0, 3)
      .map((q) => ({ q: String(q.q), a: String(q.a ?? "") }));
    const lesson = (res.data.lesson ?? res.data.markdown ?? "").trim();
    if (!lesson) throw new Error("empty lesson");
    await recordAiUse(req, db, AI_KIND); // quota counts successful lessons only
    return NextResponse.json({ ok: true, lesson, questions });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Lesson generation failed: ${(e as Error).message}` }, { status: 502 });
  }
}
