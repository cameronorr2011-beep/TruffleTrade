import { NextResponse } from "next/server";
import { softGuard, callerId, isLocalOperator } from "@/lib/guard";
import { ecoDb } from "@core/eco/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/**
 * GET /api/eco/insights — the single feed behind My Market Intelligence.
 * Everything the user owns, aggregated transparently:
 *   stats    — headline counters (every one traces to real rows)
 *   focus    — assets ranked by total research activity
 *   activity — per-day record counts for the last 10 weeks (heatmap)
 *   learning — progress by topic
 *   brief    — Black Truffle's short read of the user's own patterns (AI,
 *              skipped silently on failure; the page never blocks on it)
 */
export async function GET(req: Request) {
  const denied = await softGuard(req);
  if (denied) return denied;
  const userId = callerId(req);
  const db = ecoDb();

  const [theses, journal, notes, lessons] = await Promise.all([
    db.listTheses(userId, { limit: 200 }),
    db.listJournal(userId, { limit: 200 }),
    db.listNotes(userId, 200),
    db.lessonProgress(userId),
  ]);

  // ── focus assets: ranked by total activity across all record types ──
  const focusMap = new Map<string, { asset: string; theses: number; journal: number; notes: number }>();
  const bump = (asset: string | null, kind: "theses" | "journal" | "notes") => {
    if (!asset) return;
    const key = asset.toUpperCase().trim();
    if (!key) return;
    const cur = focusMap.get(key) ?? { asset: key, theses: 0, journal: 0, notes: 0 };
    cur[kind] += 1;
    focusMap.set(key, cur);
  };
  for (const t of theses) bump(t.asset, "theses");
  for (const j of journal) bump(j.asset, "journal");
  for (const n of notes) for (const tag of n.tags) bump(tag, "notes");
  const focus = [...focusMap.values()]
    .map((f) => ({ ...f, total: f.theses + f.journal + f.notes }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  // ── activity: per-day counts, last 70 days (heatmap grid 10w × 7d) ──
  const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const ts of [
    ...theses.map((t) => t.updatedAt),
    ...journal.map((j) => j.ts),
    ...notes.map((n) => n.ts),
  ]) {
    const k = dayKey(ts);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const activity: { day: string; count: number }[] = [];
  for (let i = 69; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY);
    const k = d.toISOString().slice(0, 10);
    activity.push({ day: k, count: counts.get(k) ?? 0 });
  }
  // streak: consecutive active days ending today or yesterday
  let streak = 0;
  const startOffset = counts.has(dayKey(today.getTime())) ? 0 : 1;
  for (let i = startOffset; i < 400; i++) {
    const k = dayKey(today.getTime() - i * DAY);
    if (counts.get(k)) streak++;
    else break;
  }

  // ── journal outcome honesty metrics (transparent keyword read) ──
  const withOutcome = journal.filter((e) => e.outcome);
  const matched = withOutcome.filter((e) => {
    const exp = (e.expectation ?? "").toLowerCase();
    const got = (e.outcome?.whatHappened ?? "").toLowerCase();
    if (!exp) return false;
    const expUp = /\b(up|rise|rally|bull|higher|break ?out)\b/.test(exp);
    const gotUp = /\b(up|rose|rallied|bull|higher|broke ?out|gain)/.test(got);
    const expDown = /\b(down|fall|drop|bear|lower|break ?down)\b/.test(exp);
    const gotDown = /\b(down|fell|dropped|bear|lower|broke ?down|loss)/.test(got);
    return (expUp && gotUp) || (expDown && gotDown);
  });

  const scored = lessons.filter((l) => l.bestScore != null);
  const avgQuiz = scored.length ? Math.round(scored.reduce((a, l) => a + (l.bestScore ?? 0), 0) / scored.length) : null;

  const stats = {
    thesesTotal: theses.length,
    thesesActive: theses.filter((t) => t.status === "active").length,
    thesesValidated: theses.filter((t) => t.status === "validated").length,
    thesesInvalidated: theses.filter((t) => t.status === "invalidated").length,
    journalTotal: journal.length,
    journalWithOutcomes: withOutcome.length,
    directionMatched: matched.length,
    notes: notes.length,
    lessonsTopics: lessons.length,
    lessonsAttempts: lessons.reduce((a, l) => a + l.attempts, 0),
    avgQuiz,
    streakDays: streak,
  };

  // ── Black Truffle brief: a short AI read of the user's own numbers ──
  let brief: string | null = null;
  let briefError: string | undefined;
  const hasData = theses.length + journal.length + notes.length + lessons.length > 0;
  if (hasData) {
    try {
      const { makeProvider } = await import("@core/research/ai");
      const provider = makeProvider();
      const factSheet = [
        `theses: ${stats.thesesTotal} total (${stats.thesesActive} active, ${stats.thesesValidated} validated, ${stats.thesesInvalidated} invalidated)`,
        `journal: ${stats.journalTotal} entries, ${stats.journalWithOutcomes} with recorded outcomes, ${stats.directionMatched} direction-matched`,
        `notes: ${stats.notes}`,
        `learning: ${lessons.map((l) => `${l.topic} best ${l.bestScore ?? "-"}%`).join("; ") || "none"}`,
        `focus assets: ${focus.map((f) => f.asset).join(", ") || "none"}`,
        `activity streak: ${stats.streakDays} days`,
      ].join("\n");
      const res = await provider.chatJson<{ brief?: string }>(
        [
          {
            role: "system",
            content:
              "You are Black Truffle, the personal TruffleTrade assistant. Using ONLY the fact sheet provided, write a 2-3 sentence brief on the user's OWN research patterns. " +
              "Be concrete and non-judgmental: name their focus assets, note what they track well (e.g. outcomes recorded vs missing, quiz scores, invalidated theses), and suggest ONE next action. " +
              "No praise inflation, no scores, no predictions, no invented facts.",
          },
          { role: "user", content: factSheet },
        ],
        "insights-brief-v1",
        300,
        { temperature: 0.4 },
      );
      brief = (res.data.brief ?? "").trim() || null;
    } catch (e) {
      briefError = (e as Error).message;
    }
  }

  return NextResponse.json({
    ok: true,
    generatedBy: isLocalOperator(req) ? "local-operator" : "subscriber",
    stats,
    focus,
    activity,
    learning: lessons.map((l) => ({ topic: l.topic, attempts: l.attempts, bestScore: l.bestScore })),
    brief,
    briefError,
    note: "Every number comes from your own records. Direction match compares the words you wrote against what you recorded happening — an observation, not a grade.",
  });
}
