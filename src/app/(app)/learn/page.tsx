"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/accessCodeClient";

interface Progress {
  topic: string;
  attempts: number;
  bestScore: number | null;
  lastAt: number;
}

const TOPICS = [
  "Market basics",
  "Chart reading",
  "Technical analysis",
  "Fundamentals",
  "Financial statements",
  "Risk",
  "Portfolio construction",
  "Macroeconomics",
  "Quantitative analysis",
  "Behavioral finance",
] as const;

interface LessonState {
  topic: string;
  lesson: string;
  questions: { q: string; a: string }[];
}

/**
 * Learn — the education layer. Lessons are generated on demand (server-side
 * AI, gated), adapted to the user's recorded progress, and every completion
 * is stored so Black Truffle can adapt future explanations.
 */
export default function LearnPage() {
  const [progress, setProgress] = useState<Progress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [lesson, setLesson] = useState<LessonState | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [graded, setGraded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/eco/learning", { headers: authHeaders(), cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; progress?: Progress[]; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Could not load progress");
      setProgress(j.progress ?? []);
    } catch (e) {
      setError((e as Error).message);
      setProgress([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startTopic = async (topic: string) => {
    setActive(topic);
    setLesson(null);
    setAnswers({});
    setGraded(false);
    setLoadingLesson(true);
    setError(null);
    try {
      const res = await fetch("/api/eco/learn-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ topic }),
      });
      const j = (await res.json()) as { ok?: boolean; lesson?: string; questions?: { q: string; a: string }[]; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Could not generate lesson");
      setLesson({ topic, lesson: j.lesson ?? "", questions: j.questions ?? [] });
    } catch (e) {
      setError((e as Error).message);
      setActive(null);
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
      await fetch("/api/eco/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ topic: lesson.topic, lesson: lesson.lesson.slice(0, 4000), quizScore: score }),
      });
      load();
    } catch {
      // progress storage is best-effort; the quiz result is already shown
    }
  };

  const progressFor = (topic: string) => progress?.find((p) => p.topic.toLowerCase() === topic.toLowerCase());

  return (
    <section className="tt-page">
      <div className="tt-pagehead">
        <div>
          <h1>Learn</h1>
          <p className="tt-faint">Short lessons with a quick check. Progress is remembered; lessons adapt to what you have already completed.</p>
        </div>
      </div>

      {error && <p className="tt-error">{error}</p>}

      <div className="tt-grid-4" style={{ marginBottom: 16 }}>
        {TOPICS.map((t) => {
          const p = progressFor(t);
          return (
            <button key={t} type="button" className={`tt-card tt-card-pad bt-topic ${active === t ? "is-active" : ""}`} onClick={() => startTopic(t)}>
              <h2>{t}</h2>
              <p className="tt-faint">{p ? `${p.attempts} lesson${p.attempts > 1 ? "s" : ""} · best ${p.bestScore ?? "—"}%` : "not started"}</p>
            </button>
          );
        })}
      </div>

      {loadingLesson && <div className="tt-card tt-card-pad"><p className="tt-empty">White Truffle is preparing your lesson…</p></div>}

      {lesson && !loadingLesson && (
        <div className="tt-card tt-card-pad">
          <h2>{lesson.topic}</h2>
          <div className="bt-lesson">{lesson.lesson.split("\n").filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}</div>

          {lesson.questions.length > 0 && (
            <>
              <h3 className="bt-quiz-title">Quick check</h3>
              {lesson.questions.map((q, i) => (
                <div key={i} className="bt-quiz-q">
                  <p>{q.q}</p>
                  <input
                    value={answers[i] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                    placeholder="Your answer…"
                    disabled={graded}
                    maxLength={200}
                  />
                  {graded && <p className="tt-faint">Answer: {q.a}</p>}
                </div>
              ))}
              {!graded ? (
                <button type="button" className="tt-btn tt-btn-primary" onClick={submitQuiz} disabled={Object.keys(answers).length === 0}>
                  Submit
                </button>
              ) : (
                <p className="bt-outcome">Recorded. Black Truffle will adapt future explanations to this.</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
