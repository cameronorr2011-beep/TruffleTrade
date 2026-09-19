"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/accessCodeClient";

interface Entry {
  id: number;
  ts: number;
  asset: string | null;
  belief: string;
  reasoning: string | null;
  evidence: string[];
  expectation: string | null;
  invalidation: string | null;
  outcome?: { whatHappened: string; differed: string | null; ts: number } | null;
}

export default function JournalPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [outcomeFor, setOutcomeFor] = useState<number | null>(null);
  const [outcomeText, setOutcomeText] = useState("");
  const [form, setForm] = useState({ asset: "", belief: "", reasoning: "", expectation: "", invalidation: "" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/eco/journal", { headers: authHeaders(), cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; entries?: Entry[]; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Could not load journal");
      setEntries(j.entries ?? []);
    } catch (e) {
      setError((e as Error).message);
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (form.belief.trim().length < 4) return;
    setSaving(true);
    try {
      const res = await fetch("/api/eco/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          asset: form.asset.trim() || null,
          belief: form.belief.trim(),
          reasoning: form.reasoning.trim() || null,
          expectation: form.expectation.trim() || null,
          invalidation: form.invalidation.trim() || null,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Could not save");
      setForm({ asset: "", belief: "", reasoning: "", expectation: "", invalidation: "" });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const recordOutcome = async () => {
    if (outcomeFor == null || outcomeText.trim().length < 2) return;
    try {
      const res = await fetch("/api/eco/journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ journalId: outcomeFor, whatHappened: outcomeText.trim() }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Could not record outcome");
      setOutcomeFor(null);
      setOutcomeText("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="tt-page">
      <div className="tt-pagehead">
        <div>
          <h1>Decision Journal</h1>
          <p className="tt-faint">
            What you believed, why, and what would prove you wrong — then what actually happened. No scores, just your own record to learn from.
          </p>
        </div>
      </div>

      {error && <p className="tt-error">{error}</p>}

      <div className="tt-card tt-card-pad" style={{ marginBottom: 16 }}>
        <h2>New entry</h2>
        <div className="bt-form-grid bt-form-grid-3">
          <label>
            Asset (optional)
            <input value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value.toUpperCase() })} placeholder="TSLA" maxLength={12} />
          </label>
          <label>
            Expectation
            <input value={form.expectation} onChange={(e) => setForm({ ...form, expectation: e.target.value })} placeholder="breaks above 200-day and holds" maxLength={2000} />
          </label>
          <label>
            Wrong if
            <input value={form.invalidation} onChange={(e) => setForm({ ...form, invalidation: e.target.value })} placeholder="closes back below the 50-day" maxLength={2000} />
          </label>
        </div>
        <label>
          What I believe
          <textarea value={form.belief} onChange={(e) => setForm({ ...form, belief: e.target.value })} rows={2} placeholder="Momentum continues into earnings because…" maxLength={2000} />
        </label>
        <label>
          Why (evidence used)
          <textarea value={form.reasoning} onChange={(e) => setForm({ ...form, reasoning: e.target.value })} rows={2} placeholder="Which data points from which analysis" maxLength={4000} />
        </label>
        <button type="button" className="tt-btn tt-btn-primary" onClick={save} disabled={saving || form.belief.trim().length < 4}>
          {saving ? "Saving…" : "Record entry"}
        </button>
      </div>

      {entries === null ? (
        <p className="tt-empty">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="tt-card tt-card-pad">
          <h2>No entries yet</h2>
          <p className="tt-faint">
            Record your first decision above, or tell Black Truffle (◆): “Add to my journal: I believe X because Y, wrong if Z.” Come back when the market
            has voted and record what happened.
          </p>
        </div>
      ) : (
        <div className="tt-grid">
          {entries.map((e) => (
            <article key={e.id} className="tt-card tt-card-pad">
              <header className="bt-thesis-head">
                <h2>{e.asset ?? "General"}</h2>
                <span className="tt-faint">{new Date(e.ts).toLocaleDateString()}</span>
              </header>
              <p className="bt-claim">“{e.belief}”</p>
              {e.reasoning && <p className="tt-faint bt-evi-note">Why: {e.reasoning}</p>}
              {e.expectation && (
                <p className="tt-faint bt-evi-note">
                  Expected: {e.expectation}
                  {e.invalidation ? ` · wrong if ${e.invalidation}` : ""}
                </p>
              )}
              {e.outcome ? (
                <p className="bt-outcome">
                  Outcome: {e.outcome.whatHappened}
                  {e.outcome.differed ? ` (${e.outcome.differed})` : ""}
                </p>
              ) : (
                outcomeFor === e.id ? (
                  <div className="bt-outcome-form">
                    <input
                      value={outcomeText}
                      onChange={(ev) => setOutcomeText(ev.target.value)}
                      placeholder="What actually happened?"
                      maxLength={2000}
                      autoFocus
                    />
                    <button type="button" className="tt-btn tt-btn-primary" onClick={recordOutcome} disabled={outcomeText.trim().length < 2}>
                      Save
                    </button>
                  </div>
                ) : (
                  <button type="button" className="tt-btn tt-btn-ghost" onClick={() => { setOutcomeFor(e.id); setOutcomeText(""); }}>
                    Record outcome
                  </button>
                )
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
