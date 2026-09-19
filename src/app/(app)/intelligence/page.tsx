"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/accessCodeClient";
import AnimatedNumber from "@/components/app/AnimatedNumber";

interface Insights {
  stats: {
    thesesTotal: number; thesesActive: number; thesesValidated: number; thesesInvalidated: number;
    journalTotal: number; journalWithOutcomes: number; directionMatched: number;
    notes: number; lessonsTopics: number; lessonsAttempts: number; avgQuiz: number | null; streakDays: number;
  };
  focus: { asset: string; theses: number; journal: number; notes: number; total: number }[];
  activity: { day: string; count: number }[];
  learning: { topic: string; attempts: number; bestScore: number | null }[];
  brief: string | null;
  briefError?: string;
  note: string;
}

const TOPICS = ["Market basics", "Chart reading", "Technical analysis", "Fundamentals", "Financial statements", "Risk", "Portfolio construction", "Macroeconomics", "Quantitative analysis", "Behavioral finance"];

function Stat({ label, value, sub, accent }: { label: string; value: number | null; sub?: string; accent?: "gold" | "pos" }) {
  return (
    <div className="tt-card tt-card-pad bt-stat">
      <p className="tt-faint bt-stat-label">{label}</p>
      <p className={`bt-stat-value ${accent === "gold" ? "bt-gold" : ""}`}>
        <AnimatedNumber value={value} format={(n) => String(Math.round(n))} />
      </p>
      {sub && <p className="tt-faint bt-stat-sub">{sub}</p>}
    </div>
  );
}

function Heatmap({ activity }: { activity: { day: string; count: number }[] }) {
  if (!activity.length) return null;
  const max = Math.max(...activity.map((a) => a.count), 1);
  const weeks: { day: string; count: number }[][] = [];
  for (let i = 0; i < activity.length; i += 7) weeks.push(activity.slice(i, i + 7));
  const level = (c: number) => (c === 0 ? 0 : c <= max * 0.25 ? 1 : c <= max * 0.5 ? 2 : c <= max * 0.75 ? 3 : 4);
  return (
    <div className="bt-heat" role="img" aria-label="Research activity over the last 10 weeks">
      {weeks.map((w, wi) => (
        <div key={wi} className="bt-heat-col">
          {w.map((d) => (
            <span key={d.day} className={`bt-heat-cell lvl-${level(d.count)}`} title={`${d.day}: ${d.count} record${d.count === 1 ? "" : "s"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function IntelligencePage() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/eco/insights", { headers: authHeaders(), cache: "no-store" });
        const j = (await res.json()) as { ok?: boolean; error?: string } & Insights;
        if (!j.ok) throw new Error(j.error ?? "Could not load insights");
        setData(j);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  return (
    <section className="tt-page bt-page">
      <div className="tt-pagehead">
        <div>
          <h1>My Market Intelligence</h1>
          <p className="tt-faint">The whole ecosystem, measured. Every number traces to your own records — no scores, no grades.</p>
        </div>
      </div>

      {error && <p className="tt-error">{error}</p>}
      {!data && !error && <div className="tt-grid-4">{[0, 1, 2, 3].map((i) => <div key={i} className="tt-card tt-card-pad bt-skeleton" />)}</div>}

      {data && (
        <>
          {/* Black Truffle's read of your patterns */}
          <div className="bt-brief tt-card">
            <div className="bt-brief-head">
              <span className="bt-brief-badge">◆ BLACK TRUFFLE</span>
              <span className="tt-faint">your research, read back to you</span>
            </div>
            {data.brief ? (
              <p className="bt-brief-text">{data.brief}</p>
            ) : data.briefError ? (
              <p className="tt-empty">Brief unavailable right now — the numbers below are all live regardless.</p>
            ) : (
              <p className="tt-empty">Write your first thesis, journal entry, or lesson and Black Truffle will start reading your patterns here.</p>
            )}
          </div>

          {/* Headline stats */}
          <div className="tt-grid-4" style={{ marginTop: 16 }}>
            <Stat label="Active theses" value={data.stats.thesesActive} sub={`${data.stats.thesesTotal} total · ${data.stats.thesesInvalidated} invalidated`} />
            <Stat label="Journal outcomes" value={data.stats.journalWithOutcomes} sub={`${data.stats.journalTotal} entries recorded`} />
            <Stat label="Research streak" value={data.stats.streakDays} sub={data.stats.streakDays > 1 ? "consecutive days" : "day — keep it going"} accent="gold" />
            <Stat label="Avg best quiz" value={data.stats.avgQuiz} sub={`${data.stats.lessonsAttempts} lessons across ${data.stats.lessonsTopics} topics`} accent="pos" />
          </div>

          <div className="tt-grid" style={{ marginTop: 16 }}>
            {/* Focus assets */}
            <div className="tt-card tt-card-pad">
              <h2>Focus assets</h2>
              {data.focus.length === 0 ? (
                <p className="tt-empty">Analyze a ticker, write a thesis, or add a journal entry to build your focus profile.</p>
              ) : (
                <ul className="bt-focus">
                  {data.focus.map((f) => (
                    <li key={f.asset}>
                      <span className="bt-focus-asset">{f.asset}</span>
                      <span className="bt-focus-split">
                        {f.theses > 0 && <em>{f.theses} thesis{f.theses > 1 ? "s" : ""}</em>}
                        {f.journal > 0 && <em>{f.journal} journal</em>}
                        {f.notes > 0 && <em>{f.notes} notes</em>}
                      </span>
                      <span className="bt-bars-track bt-focus-track"><span className="bt-bars-fill" style={{ width: `${Math.max(10, (f.total / data.focus[0].total) * 100)}%` }} /></span>
                      <span className="bt-bars-num">{f.total}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Expectation vs outcome */}
            <div className="tt-card tt-card-pad">
              <h2>Expectation vs. outcome</h2>
              {data.stats.journalWithOutcomes === 0 ? (
                <p className="tt-empty">Record what actually happened on your journal entries — that&apos;s where honest patterns come from.</p>
              ) : (
                <>
                  <p className="bt-stat-value">
                    <AnimatedNumber value={data.stats.directionMatched} format={(n) => String(Math.round(n))} />
                    <span className="bt-stat-of"> / {data.stats.journalWithOutcomes}</span>
                  </p>
                  <p className="tt-faint bt-stat-sub">entries where the outcome moved the direction you expected. {data.note}</p>
                </>
              )}
            </div>

            {/* Learning */}
            <div className="tt-card tt-card-pad">
              <h2>Learning</h2>
              {data.learning.length === 0 ? (
                <>
                  <p className="tt-empty">No lessons yet — pick a topic:</p>
                  <div className="bt-topic-chips">
                    {TOPICS.slice(0, 5).map((t) => <a key={t} href="/learn" className="bt-chip">{t}</a>)}
                  </div>
                </>
              ) : (
                <ul className="bt-list">
                  {data.learning.map((l) => (
                    <li key={l.topic}>
                      <span>{l.topic}</span>
                      <span className="tt-faint">{l.attempts}× · best {l.bestScore ?? "—"}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Activity heatmap */}
          <div className="tt-card tt-card-pad" style={{ marginTop: 16 }}>
            <h2>Research activity — last 10 weeks</h2>
            <Heatmap activity={data.activity} />
            <p className="tt-faint bt-heat-legend">
              theses, journal entries, and notes per day ·
              <span className="bt-heat-cell lvl-0" aria-hidden /> none
              <span className="bt-heat-cell lvl-1" aria-hidden /> light
              <span className="bt-heat-cell lvl-3" aria-hidden /> heavy
            </p>
          </div>
        </>
      )}
    </section>
  );
}
