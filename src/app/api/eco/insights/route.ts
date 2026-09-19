import { NextResponse } from "next/server";
import { guard, callerId } from "@/lib/guard";
import { ecoDb } from "@core/eco/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/eco/insights — transparent personal metrics from the user's OWN
 * records. No arbitrary "trader score": every number is a count or a ratio
 * the user can trace back to rows in their database.
 */
export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const userId = callerId(req);
  const db = ecoDb();

  const [theses, journal, notes, lessons] = await Promise.all([
    db.listTheses(userId, { limit: 200 }),
    db.listJournal(userId, { limit: 200 }),
    db.listNotes(userId, 200),
    db.lessonProgress(userId),
  ]);

  const byAsset = <T extends { asset: string | null }>(rows: T[]): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      if (!r.asset) continue;
      m[r.asset] = (m[r.asset] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
  };

  const withOutcome = journal.filter((e) => e.outcome);
  const matched = withOutcome.filter((e) => {
    const exp = (e.expectation ?? "").toLowerCase();
    const got = (e.outcome?.whatHappened ?? "").toLowerCase();
    if (!exp) return false;
    // Crude direction match: up/down language overlap between expectation and outcome.
    const expUp = /\b(up|rise|rally|bull|higher|break ?out)\b/.test(exp);
    const gotUp = /\b(up|rose|rallied|bull|higher|broke ?out|gain)/.test(got);
    const expDown = /\b(down|fall|drop|bear|lower|break ?down)\b/.test(exp);
    const gotDown = /\b(down|fell|dropped|bear|lower|broke ?down|loss)/.test(got);
    return (expUp && gotUp) || (expDown && gotDown);
  });

  // Research activity is intentionally NOT fabricated: per-ticker White
  // Truffle run counts require the operator's local research store, which is
  // not user-scoped on the gateway. The UI surfaces what is user-owned.

  return NextResponse.json({
    ok: true,
    theses: {
      total: theses.length,
      active: theses.filter((t) => t.status === "active").length,
      validated: theses.filter((t) => t.status === "validated").length,
      invalidated: theses.filter((t) => t.status === "invalidated").length,
      mostResearched: byAsset(theses),
    },
    journal: {
      total: journal.length,
      withOutcomes: withOutcome.length,
      outcomeRate: journal.length ? Math.round((withOutcome.length / journal.length) * 100) : 0,
      directionMatched: matched.length,
      // Transparent: this is a keyword-based read of the user's own words,
      // not a verdict on ability.
      note: "Direction match compares the words you wrote (expectation) against what you recorded happening. It is an observation, not a grade.",
      byAsset: byAsset(journal),
    },
    research: {
      notes: notes.length,
      lessonsTopics: lessons.length,
      lessonsAttempts: lessons.reduce((a, l) => a + l.attempts, 0),
      avgQuiz: (() => {
        const scored = lessons.filter((l) => l.bestScore != null);
        return scored.length ? Math.round(scored.reduce((a, l) => a + (l.bestScore ?? 0), 0) / scored.length) : null;
      })(),
    },
    learning: lessons.map((l) => ({ topic: l.topic, attempts: l.attempts, bestScore: l.bestScore })),
  });
}
