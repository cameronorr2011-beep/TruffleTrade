"use client";

/**
 * My Market Intelligence — the free, personal side of TruffleTrade.
 *
 * One white-themed hub (the visual opposite of the dark AI Analyst) holding
 * the whole personal ecosystem: overview stats, theses, decision journal,
 * and lessons. Tab state lives in the URL (?tab=theses) so links are stable
 * and the old /theses, /journal, /learn URLs land on their tab.
 *
 * Access: free for everyone. Data endpoints are open (softGuard); the two AI
 * features (lesson generation, Black Truffle) are freemium — 5 sessions/day,
 * unlimited on subscription.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authHeaders } from "@/lib/accessCodeClient";
import AnimatedNumber from "@/components/app/AnimatedNumber";

type Tab = "overview" | "theses" | "journal" | "learn";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◑" },
  { id: "theses", label: "Theses", icon: "◈" },
  { id: "journal", label: "Journal", icon: "✎" },
  { id: "learn", label: "Learn", icon: "❖" },
];

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

interface Thesis {
  id: number;
  asset: string;
  claim: string;
  timeHorizon: string | null;
  supportingEvidence: string[];
  invalidationConditions: string[];
  confidence: number | null;
  status: string;
  updatedAt: number;
}

interface Entry {
  id: number;
  ts: number;
  asset: string | null;
  belief: string;
  reasoning: string | null;
  expectation: string | null;
  invalidation: string | null;
  outcome?: { whatHappened: string; differed: string | null; ts: number } | null;
}

interface Progress {
  topic: string;
  attempts: number;
  bestScore: number | null;
}

const TOPICS = ["Market basics", "Chart reading", "Technical analysis", "Fundamentals", "Financial statements", "Risk", "Portfolio construction", "Macroeconomics", "Quantitative analysis", "Behavioral finance"];
const THESIS_STATUS: Record<string, string> = { active: "mi-pill ok", validated: "mi-pill ok", invalidated: "mi-pill bad", retired: "mi-pill warn" };

function Stat({ label, value, sub, accent }: { label: string; value: number | null; sub?: string; accent?: "gold" | "pos" }) {
  return (
    <div className="mi-card mi-stat">
      <p className="mi-faint">{label}</p>
      <p className={`mi-stat-value ${accent === "gold" ? "mi-gold" : accent === "pos" ? "mi-pos" : ""}`}>
        <AnimatedNumber value={value} format={(n) => String(Math.round(n))} />
      </p>
      {sub && <p className="mi-faint mi-stat-sub">{sub}</p>}
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
    <div className="mi-heat" role="img" aria-label="Research activity over the last 10 weeks">
      {weeks.map((w, wi) => (
        <div key={wi} className="mi-heat-col">
          {w.map((d) => (
            <span key={d.day} className={`mi-heat-cell lvl-${level(d.count)}`} title={`${d.day}: ${d.count} record${d.count === 1 ? "" : "s"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function IntelligenceHub() {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : "overview";
  const setTab = (t: Tab) => router.replace(`/intelligence?tab=${t}`, { scroll: false });

  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theses, setTheses] = useState<Thesis[] | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [progress, setProgress] = useState<Progress[] | null>(null);

  const [thesisForm, setThesisForm] = useState({ asset: "", claim: "", horizon: "", evidence: "", invalidation: "" });
  const [thesisOpen, setThesisOpen] = useState(false);
  const [savingThesis, setSavingThesis] = useState(false);

  const [journalForm, setJournalForm] = useState({ asset: "", belief: "", reasoning: "", expectation: "", invalidation: "" });
  const [savingJournal, setSavingJournal] = useState(false);
  const [outcomeFor, setOutcomeFor] = useState<number | null>(null);
  const [outcomeText, setOutcomeText] = useState("");
  const [outcomeSaving, setOutcomeSaving] = useState(false);

  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [lesson, setLesson] = useState<{ topic: string; lesson: string; questions: { q: string; a: string }[] } | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [graded, setGraded] = useState(false);
  const [freemium, setFreemium] = useState(false);

  const json = useCallback(async (input: RequestInfo, init?: RequestInit) => {
    const res = await fetch(input, { cache: "no-store", ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
    return (await res.json()) as { ok?: boolean; error?: string; code?: string } & Record<string, unknown>;
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const j = await json("/api/eco/insights");
      if (!j.ok) throw new Error(j.error ?? "Could not load insights");
      setData(j as unknown as Insights);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [json]);

  const loadTheses = useCallback(async () => {
    try {
      const j = await json("/api/eco/theses");
      if (!j.ok) throw new Error(j.error ?? "Could not load theses");
      setTheses((j.theses as Thesis[]) ?? []);
    } catch (e) {
      setError((e as Error).message);
      setTheses([]);
    }
  }, [json]);

  const loadJournal = useCallback(async () => {
    try {
      const j = await json("/api/eco/journal");
      if (!j.ok) throw new Error(j.error ?? "Could not load journal");
      setEntries((j.entries as Entry[]) ?? []);
    } catch (e) {
      setError((e as Error).message);
      setEntries([]);
    }
  }, [json]);

  const loadProgress = useCallback(async () => {
    try {
      const j = await json("/api/eco/learning");
      if (!j.ok) throw new Error(j.error ?? "Could not load progress");
      setProgress((j.progress as Progress[]) ?? []);
    } catch (e) {
      setError((e as Error).message);
      setProgress([]);
    }
  }, [json]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (tab === "theses") loadTheses();
    if (tab === "journal") loadJournal();
    if (tab === "learn") loadProgress();
  }, [tab, loadTheses, loadJournal, loadProgress]);

  const saveThesis = async () => {
    if (!thesisForm.asset.trim() || thesisForm.claim.trim().length < 8) return;
    setSavingThesis(true);
    setError(null);
    try {
      const j = await json("/api/eco/theses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: thesisForm.asset.trim(),
          claim: thesisForm.claim.trim(),
          timeHorizon: thesisForm.horizon.trim() || null,
          supportingEvidence: thesisForm.evidence.split("\n").map((s) => s.trim()).filter(Boolean),
          invalidationConditions: thesisForm.invalidation.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!j.ok) throw new Error(j.error ?? "Could not save");
      setThesisForm({ asset: "", claim: "", horizon: "", evidence: "", invalidation: "" });
      setThesisOpen(false);
      loadTheses();
      loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingThesis(false);
    }
  };

  const saveJournal = async () => {
    if (journalForm.belief.trim().length < 4) return;
    setSavingJournal(true);
    setError(null);
    try {
      const j = await json("/api/eco/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: journalForm.asset.trim() || null,
          belief: journalForm.belief.trim(),
          reasoning: journalForm.reasoning.trim() || null,
          expectation: journalForm.expectation.trim() || null,
          invalidation: journalForm.invalidation.trim() || null,
        }),
      });
      if (!j.ok) throw new Error(j.error ?? "Could not save");
      setJournalForm({ asset: "", belief: "", reasoning: "", expectation: "", invalidation: "" });
      loadJournal();
      loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingJournal(false);
    }
  };

  const recordOutcome = async () => {
    if (outcomeFor == null || outcomeText.trim().length < 2) return;
    setOutcomeSaving(true);
    try {
      const j = await json("/api/eco/journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journalId: outcomeFor, whatHappened: outcomeText.trim() }),
      });
      if (!j.ok) throw new Error(j.error ?? "Could not record outcome");
      setOutcomeFor(null);
      setOutcomeText("");
      loadJournal();
      loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOutcomeSaving(false);
    }
  };

  const startTopic = async (topic: string) => {
    setActiveTopic(topic);
    setLesson(null);
    setAnswers({});
    setGraded(false);
    setLoadingLesson(true);
    setFreemium(false);
    setError(null);
    try {
      const j = await json("/api/eco/learn-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      if (j.code === "FREEMIUM_LIMIT") {
        setFreemium(true);
        setActiveTopic(null);
        return;
      }
      if (!j.ok) throw new Error(j.error ?? "Could not generate lesson");
      setLesson({ topic, lesson: String(j.lesson ?? ""), questions: (j.questions as { q: string; a: string }[]) ?? [] });
    } catch (e) {
      setError((e as Error).message);
      setActiveTopic(null);
    } finally {
      setLoadingLesson(false);
    }
  };

  const submitQuiz = async () => {
    if (!lesson) return;
    let correct = 0;
    for (let i = 0; i < lesson.questions.length; i++) {
      const want = (lesson.questions[i].a ?? "").trim().toLowerCase();
      const got = (answers[i] ?? "").trim().toLowerCase();
      if (want && (got === want || (want.length > 3 && got.includes(want)))) correct++;
    }
    const score = lesson.questions.length ? Math.round((correct / lesson.questions.length) * 100) : 0;
    setGraded(true);
    try {
      await json("/api/eco/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: lesson.topic, lesson: lesson.lesson.slice(0, 4000), quizScore: score }),
      });
      loadProgress();
      loadOverview();
    } catch {
      // progress storage is best-effort; the quiz result is already shown
    }
  };

  const progressFor = (topic: string) => progress?.find((p) => p.topic.toLowerCase() === topic.toLowerCase());

  return (
    <section className="tt-page mi-page">
      <div className="tt-pagehead">
        <div>
          <h1>My Market Intelligence</h1>
          <p className="mi-faint">Your personal ecosystem — free for everyone. Everything here lives on your device and is never graded or scored.</p>
        </div>
        <div className="mi-head-tools">
          <nav className="mi-tabs" aria-label="Intelligence sections">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={`mi-tab ${tab === t.id ? "is-active" : ""}`} onClick={() => setTab(t.id)}>
                <span aria-hidden>{t.icon}</span> {t.label}
              </button>
            ))}
          </nav>
          <div className="mi-avatar-badge" title="White + Black Truffle — your personal AI pair">
            <span className="mi-avatar mi-avatar-white" aria-hidden>W</span>
            <span className="mi-avatar mi-avatar-black" aria-hidden>B</span>
          </div>
        </div>
      </div>

      {freemium && (
        <div className="mi-paywall">
          <strong>You&apos;ve used today&apos;s 5 free Truffle sessions.</strong>
          <span>Subscribe for 1,000 sats/month to unlock unlimited White + Black Truffle.</span>
          <a className="mi-paywall-btn" href="/buy">Subscribe</a>
        </div>
      )}

      {error && <p className="mi-error">{error}</p>}

      {tab === "overview" && (
        <>
          {!data && !error && <div className="mi-grid-4">{[0, 1, 2, 3].map((i) => <div key={i} className="mi-card mi-skeleton" />)}</div>}
          {data && (
            <>
              <div className="mi-grid-4">
                <Stat label="Active theses" value={data.stats.thesesActive} sub={`${data.stats.thesesTotal} total · ${data.stats.thesesInvalidated} invalidated`} />
                <Stat label="Journal outcomes" value={data.stats.journalWithOutcomes} sub={`${data.stats.journalTotal} entries recorded`} />
                <Stat label="Research streak" value={data.stats.streakDays} sub={data.stats.streakDays > 1 ? "consecutive days" : "day — keep it going"} accent="gold" />
                <Stat label="Avg best quiz" value={data.stats.avgQuiz} sub={`${data.stats.lessonsAttempts} lessons across ${data.stats.lessonsTopics} topics`} accent="pos" />
              </div>

              <div className="mi-grid" style={{ marginTop: 16 }}>
                <div className="mi-card">
                  <h2>Focus assets</h2>
                  {data.focus.length === 0 ? (
                    <p className="mi-empty">Analyze a ticker, write a thesis, or add a journal entry to build your focus profile.</p>
                  ) : (
                    <ul className="mi-focus">
                      {data.focus.map((f) => (
                        <li key={f.asset}>
                          <span className="mi-focus-asset">{f.asset}</span>
                          <span className="mi-focus-split">
                            {f.theses > 0 && <em>{f.theses} thesis{f.theses > 1 ? "s" : ""}</em>}
                            {f.journal > 0 && <em>{f.journal} journal</em>}
                            {f.notes > 0 && <em>{f.notes} notes</em>}
                          </span>
                          <span className="mi-track mi-focus-track"><span className="mi-fill" style={{ width: `${Math.max(10, (f.total / data.focus[0].total) * 100)}%` }} /></span>
                          <span className="mi-num">{f.total}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mi-card">
                  <h2>Expectation vs. outcome</h2>
                  {data.stats.journalWithOutcomes === 0 ? (
                    <p className="mi-empty">Record what actually happened on your journal entries — that&apos;s where honest patterns come from.</p>
                  ) : (
                    <>
                      <p className="mi-stat-value">
                        <AnimatedNumber value={data.stats.directionMatched} format={(n) => String(Math.round(n))} />
                        <span className="mi-stat-of"> / {data.stats.journalWithOutcomes}</span>
                      </p>
                      <p className="mi-faint mi-stat-sub">entries where the outcome moved the direction you expected. {data.note}</p>
                    </>
                  )}
                </div>

                <div className="mi-card">
                  <h2>Learning</h2>
                  {data.learning.length === 0 ? (
                    <>
                      <p className="mi-empty">No lessons yet — pick a topic:</p>
                      <div className="mi-chips">
                        {TOPICS.slice(0, 5).map((t) => (
                          <button key={t} type="button" className="mi-chip" onClick={() => setTab("learn")}>{t}</button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <ul className="mi-list">
                      {data.learning.map((l) => (
                        <li key={l.topic}>
                          <span>{l.topic}</span>
                          <span className="mi-faint">{l.attempts}× · best {l.bestScore ?? "—"}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="mi-card" style={{ marginTop: 16 }}>
                <h2>Research activity — last 10 weeks</h2>
                <Heatmap activity={data.activity} />
                <p className="mi-faint mi-heat-legend">
                  theses, journal entries, and notes per day ·
                  <span className="mi-heat-cell lvl-0" aria-hidden /> none
                  <span className="mi-heat-cell lvl-1" aria-hidden /> light
                  <span className="mi-heat-cell lvl-3" aria-hidden /> heavy
                </p>
              </div>

              <div className="mi-card mi-brief" style={{ marginTop: 16 }}>
                <div className="mi-brief-head">
                  <span className="mi-avatar mi-avatar-black" aria-hidden>B</span>
                  <strong>Black Truffle</strong>
                  <span className="mi-faint">your research, read back to you</span>
                </div>
                {data.brief ? (
                  <p className="mi-brief-text">{data.brief}</p>
                ) : data.briefError ? (
                  <p className="mi-empty">Brief unavailable right now — the numbers above are all live regardless.</p>
                ) : (
                  <p className="mi-empty">Write your first thesis, journal entry, or lesson and Black Truffle will start reading your patterns here.</p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {tab === "theses" && (
        <>
          <div className="mi-row">
            <p className="mi-faint">Structured beliefs with explicit invalidation. Black Truffle checks these against new information.</p>
            <button type="button" className="mi-btn" onClick={() => setThesisOpen((v) => !v)}>
              {thesisOpen ? "Cancel" : "New thesis"}
            </button>
          </div>

          {thesisOpen && (
            <div className="mi-card" style={{ marginBottom: 16 }}>
              <h2>New investment thesis</h2>
              <div className="mi-form-grid">
                <label>
                  Asset (ticker)
                  <input value={thesisForm.asset} onChange={(e) => setThesisForm({ ...thesisForm, asset: e.target.value.toUpperCase() })} placeholder="NVDA" maxLength={12} />
                </label>
                <label>
                  Time horizon
                  <input value={thesisForm.horizon} onChange={(e) => setThesisForm({ ...thesisForm, horizon: e.target.value })} placeholder="12 months" maxLength={60} />
                </label>
              </div>
              <label>
                Claim — what you believe and why it matters
                <textarea value={thesisForm.claim} onChange={(e) => setThesisForm({ ...thesisForm, claim: e.target.value })} rows={3} placeholder="AI infrastructure spending remains strong, so data-center demand keeps revenue growing…" maxLength={2000} />
              </label>
              <div className="mi-form-grid">
                <label>
                  Supporting evidence (one per line)
                  <textarea value={thesisForm.evidence} onChange={(e) => setThesisForm({ ...thesisForm, evidence: e.target.value })} rows={3} placeholder={"Revenue growth\nData-center demand"} />
                </label>
                <label>
                  Invalidation conditions (one per line)
                  <textarea value={thesisForm.invalidation} onChange={(e) => setThesisForm({ ...thesisForm, invalidation: e.target.value })} rows={3} placeholder={"Data-center capex down >10% y/y\nTwo quarters of revenue misses"} />
                </label>
              </div>
              <button type="button" className="mi-btn" onClick={saveThesis} disabled={savingThesis || !thesisForm.asset.trim() || thesisForm.claim.trim().length < 8}>
                {savingThesis ? "Saving…" : "Save thesis"}
              </button>
            </div>
          )}

          {theses === null ? (
            <p className="mi-empty">Loading…</p>
          ) : theses.length === 0 ? (
            <div className="mi-card">
              <h2>No theses yet</h2>
              <p className="mi-faint">Write your first structured thesis above — or ask Black Truffle (◆): “Help me draft a thesis on NVDA.” Every thesis records what would prove you wrong.</p>
            </div>
          ) : (
            <div className="mi-grid">
              {theses.map((t) => (
                <article key={t.id} className="mi-card">
                  <header className="mi-item-head">
                    <h2>{t.asset} <span className={THESIS_STATUS[t.status] ?? "mi-pill"}>{t.status}</span></h2>
                    <span className="mi-faint">{t.timeHorizon ?? "no horizon"}</span>
                  </header>
                  <p className="mi-claim">{t.claim}</p>
                  {t.supportingEvidence.length > 0 && (
                    <div className="mi-evi">
                      <span className="mi-faint">Evidence</span>
                      <ul>{t.supportingEvidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
                    </div>
                  )}
                  {t.invalidationConditions.length > 0 && (
                    <div className="mi-evi mi-evi-bad">
                      <span className="mi-faint">Invalidates if</span>
                      <ul>{t.invalidationConditions.map((e, i) => <li key={i}>{e}</li>)}</ul>
                    </div>
                  )}
                  <footer className="mi-faint mi-item-foot">updated {new Date(t.updatedAt).toLocaleDateString()} {t.confidence != null ? `· confidence ${t.confidence}%` : ""}</footer>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "journal" && (
        <>
          <div className="mi-card" style={{ marginBottom: 16 }}>
            <h2>New entry</h2>
            <div className="mi-form-grid mi-form-grid-3">
              <label>
                Asset (optional)
                <input value={journalForm.asset} onChange={(e) => setJournalForm({ ...journalForm, asset: e.target.value.toUpperCase() })} placeholder="TSLA" maxLength={12} />
              </label>
              <label>
                Expectation
                <input value={journalForm.expectation} onChange={(e) => setJournalForm({ ...journalForm, expectation: e.target.value })} placeholder="breaks above 200-day and holds" maxLength={2000} />
              </label>
              <label>
                Wrong if
                <input value={journalForm.invalidation} onChange={(e) => setJournalForm({ ...journalForm, invalidation: e.target.value })} placeholder="closes back below the 50-day" maxLength={2000} />
              </label>
            </div>
            <label>
              What I believe
              <textarea value={journalForm.belief} onChange={(e) => setJournalForm({ ...journalForm, belief: e.target.value })} rows={2} placeholder="Momentum continues into earnings because…" maxLength={2000} />
            </label>
            <label>
              Why (evidence used)
              <textarea value={journalForm.reasoning} onChange={(e) => setJournalForm({ ...journalForm, reasoning: e.target.value })} rows={2} placeholder="Which data points from which analysis" maxLength={4000} />
            </label>
            <button type="button" className="mi-btn" onClick={saveJournal} disabled={savingJournal || journalForm.belief.trim().length < 4}>
              {savingJournal ? "Saving…" : "Record entry"}
            </button>
          </div>

          {entries === null ? (
            <p className="mi-empty">Loading…</p>
          ) : entries.length === 0 ? (
            <div className="mi-card">
              <h2>No entries yet</h2>
              <p className="mi-faint">Record your first decision above, or tell Black Truffle (◆): “Add to my journal: I believe X because Y, wrong if Z.”</p>
            </div>
          ) : (
            <div className="mi-grid">
              {entries.map((e) => (
                <article key={e.id} className="mi-card">
                  <header className="mi-item-head">
                    <h2>{e.asset ?? "General"}</h2>
                    <span className="mi-faint">{new Date(e.ts).toLocaleDateString()}</span>
                  </header>
                  <p className="mi-claim">“{e.belief}”</p>
                  {e.reasoning && <p className="mi-faint mi-note">Why: {e.reasoning}</p>}
                  {e.expectation && (
                    <p className="mi-faint mi-note">
                      Expected: {e.expectation}
                      {e.invalidation ? ` · wrong if ${e.invalidation}` : ""}
                    </p>
                  )}
                  {e.outcome ? (
                    <p className="mi-outcome">Outcome: {e.outcome.whatHappened}{e.outcome.differed ? ` (${e.outcome.differed})` : ""}</p>
                  ) : outcomeFor === e.id ? (
                    <div className="mi-outcome-form">
                      <input value={outcomeText} onChange={(ev) => setOutcomeText(ev.target.value)} placeholder="What actually happened?" maxLength={2000} autoFocus />
                      <button type="button" className="mi-btn" onClick={recordOutcome} disabled={outcomeSaving || outcomeText.trim().length < 2}>Save</button>
                    </div>
                  ) : (
                    <button type="button" className="mi-btn-ghost" onClick={() => { setOutcomeFor(e.id); setOutcomeText(""); }}>Record outcome</button>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "learn" && (
        <>
          <p className="mi-faint" style={{ marginBottom: 12 }}>
            Short lessons with a quick check. Progress is remembered; lessons adapt to what you have already completed. 5 free lessons a day.
          </p>
          <div className="mi-grid-4">
            {TOPICS.map((t) => {
              const p = progressFor(t);
              return (
                <button key={t} type="button" className={`mi-card mi-topic ${activeTopic === t ? "is-active" : ""}`} onClick={() => startTopic(t)}>
                  <h2>{t}</h2>
                  <p className="mi-faint">{p ? `${p.attempts} lesson${p.attempts > 1 ? "s" : ""} · best ${p.bestScore ?? "—"}%` : "not started"}</p>
                </button>
              );
            })}
          </div>

          {loadingLesson && <div className="mi-card" style={{ marginTop: 16 }}><p className="mi-empty">Preparing your lesson…</p></div>}

          {lesson && !loadingLesson && (
            <div className="mi-card" style={{ marginTop: 16 }}>
              <h2>{lesson.topic}</h2>
              <div className="mi-lesson">{lesson.lesson.split("\n").filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}</div>
              {lesson.questions.length > 0 && (
                <>
                  <h3 className="mi-quiz-title">Quick check</h3>
                  {lesson.questions.map((q, i) => (
                    <div key={i} className="mi-quiz-q">
                      <p>{q.q}</p>
                      <input value={answers[i] ?? ""} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} placeholder="Your answer…" disabled={graded} maxLength={200} />
                      {graded && <p className="mi-faint">Answer: {q.a}</p>}
                    </div>
                  ))}
                  {!graded ? (
                    <button type="button" className="mi-btn" onClick={submitQuiz} disabled={Object.keys(answers).length === 0}>Submit</button>
                  ) : (
                    <p className="mi-outcome">Recorded. Black Truffle will adapt future explanations to this.</p>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * useSearchParams needs a Suspense boundary for static prerendering; the hub
 * itself is client-rendered regardless, so a neutral skeleton is fine.
 */
export default function IntelligencePage() {
  return (
    <Suspense fallback={<section className="tt-page mi-page"><div className="mi-grid-4">{[0, 1, 2, 3].map((i) => <div key={i} className="mi-card mi-skeleton" />)}</div></section>}>
      <IntelligenceHub />
    </Suspense>
  );
}
