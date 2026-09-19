"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/accessCodeClient";

interface Insights {
  theses: { total: number; active: number; validated: number; invalidated: number; mostResearched: Record<string, number> };
  journal: { total: number; withOutcomes: number; outcomeRate: number; directionMatched: number; note: string; byAsset: Record<string, number> };
  research: { notes: number; lessonsTopics: number; lessonsAttempts: number; avgQuiz: number | null };
  learning: { topic: string; attempts: number; bestScore: number | null }[];
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="tt-card tt-card-pad bt-stat">
      <p className="tt-faint">{label}</p>
      <p className="bt-stat-value">{value}</p>
      {sub && <p className="tt-faint bt-stat-sub">{sub}</p>}
    </div>
  );
}

function TopList({ title, map }: { title: string; map: Record<string, number> }) {
  const rows = Object.entries(map).slice(0, 6);
  return (
    <div className="tt-card tt-card-pad">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="tt-empty">No records yet.</p>
      ) : (
        <ul className="bt-bars">
          {rows.map(([k, v]) => {
            const max = rows[0][1] || 1;
            return (
              <li key={k}>
                <span className="bt-bars-label">{k}</span>
                <span className="bt-bars-track"><span className="bt-bars-fill" style={{ width: `${Math.max(8, (v / max) * 100)}%` }} /></span>
                <span className="bt-bars-num">{v}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * My Market Intelligence — transparent metrics over the user's OWN records.
 * No "trader score": every number traces back to rows the user wrote or ran.
 */
export default function IntelligencePage() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/eco/insights", { headers: authHeaders(), cache: "no-store" });
        const j = (await res.json()) as { ok?: boolean; error?: string } & Insights;
        if (!j.ok) throw new Error(j.error ?? "Could not load insights");
        setData({ theses: j.theses, journal: j.journal, research: j.research, learning: j.learning });
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  return (
    <section className="tt-page">
      <div className="tt-pagehead">
        <div>
          <h1>My Market Intelligence</h1>
          <p className="tt-faint">Patterns from your own history. Every number comes from your records — no scores, no grades.</p>
        </div>
      </div>

      {error && <p className="tt-error">{error}</p>}
      {!data && !error && <p className="tt-empty">Loading…</p>}

      {data && (
        <>
          <div className="tt-grid-4">
            <Stat label="Active theses" value={data.theses.active} sub={`${data.theses.total} total`} />
            <Stat label="Journal entries" value={data.journal.total} sub={`${data.journal.withOutcomes} with outcomes`} />
            <Stat label="Research notes" value={data.research.notes} />
            <Stat
              label="Learning"
              value={data.research.lessonsTopics}
              sub={data.research.avgQuiz != null ? `avg best quiz ${data.research.avgQuiz}%` : "no quizzes yet"}
            />
          </div>

          <div className="tt-grid" style={{ marginTop: 16 }}>
            <TopList title="Most-researched assets (theses)" map={data.theses.mostResearched} />
            <TopList title="Most-journaled assets" map={data.journal.byAsset} />

            <div className="tt-card tt-card-pad">
              <h2>Expectation vs. outcome</h2>
              {data.journal.withOutcomes === 0 ? (
                <p className="tt-empty">Record outcomes on your journal entries to see this pattern.</p>
              ) : (
                <>
                  <p className="bt-stat-value">
                    {data.journal.directionMatched}/{data.journal.withOutcomes}
                  </p>
                  <p className="tt-faint bt-stat-sub">{data.journal.note}</p>
                </>
              )}
            </div>

            <div className="tt-card tt-card-pad">
              <h2>Learning by topic</h2>
              {data.learning.length === 0 ? (
                <p className="tt-empty">Complete a lesson on the Learn page to start tracking.</p>
              ) : (
                <ul className="bt-list">
                  {data.learning.map((l) => (
                    <li key={l.topic}>
                      <span>{l.topic}</span>
                      <span className="tt-faint">
                        {l.attempts} attempt{l.attempts > 1 ? "s" : ""} · best {l.bestScore ?? "—"}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
