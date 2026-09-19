"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/accessCodeClient";

interface Thesis {
  id: number;
  asset: string;
  claim: string;
  timeHorizon: string | null;
  supportingEvidence: string[];
  counterarguments: string[];
  keyRisks: string[];
  invalidationConditions: string[];
  confidence: number | null;
  status: string;
  updatedAt: number;
}

const STATUS: Record<string, string> = { active: "tt-pill tt-pill-ok", validated: "tt-pill tt-pill-ok", invalidated: "tt-pill tt-pill-bad", retired: "tt-pill tt-pill-warn" };

export default function ThesesPage() {
  const [theses, setTheses] = useState<Thesis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ asset: "", claim: "", horizon: "", evidence: "", invalidation: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/eco/theses", { headers: authHeaders(), cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; theses?: Thesis[]; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Could not load theses");
      setTheses(j.theses ?? []);
    } catch (e) {
      setError((e as Error).message);
      setTheses([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.asset.trim() || form.claim.trim().length < 8) return;
    setSaving(true);
    try {
      const res = await fetch("/api/eco/theses", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          asset: form.asset.trim(),
          claim: form.claim.trim(),
          timeHorizon: form.horizon.trim() || null,
          supportingEvidence: form.evidence.split("\n").map((s) => s.trim()).filter(Boolean),
          invalidationConditions: form.invalidation.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Could not save");
      setForm({ asset: "", claim: "", horizon: "", evidence: "", invalidation: "" });
      setCreating(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="tt-page">
      <div className="tt-pagehead">
        <div>
          <h1>Theses</h1>
          <p className="tt-faint">Structured beliefs with explicit invalidation. Black Truffle checks these against new information.</p>
        </div>
        <button type="button" className="tt-btn tt-btn-primary" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "New thesis"}
        </button>
      </div>

      {error && <p className="tt-error">{error}</p>}

      {creating && (
        <div className="tt-card tt-card-pad" style={{ marginBottom: 16 }}>
          <h2>New investment thesis</h2>
          <div className="bt-form-grid">
            <label>
              Asset (ticker)
              <input value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value.toUpperCase() })} placeholder="NVDA" maxLength={12} />
            </label>
            <label>
              Time horizon
              <input value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value })} placeholder="12 months" maxLength={60} />
            </label>
          </div>
          <label>
            Claim — what you believe and why it matters
            <textarea value={form.claim} onChange={(e) => setForm({ ...form, claim: e.target.value })} rows={3} placeholder="AI infrastructure spending remains strong, so data-center demand keeps revenue growing…" maxLength={2000} />
          </label>
          <div className="bt-form-grid">
            <label>
              Supporting evidence (one per line)
              <textarea value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} rows={3} placeholder={"Revenue growth\nData-center demand"} />
            </label>
            <label>
              Invalidation conditions (one per line)
              <textarea value={form.invalidation} onChange={(e) => setForm({ ...form, invalidation: e.target.value })} rows={3} placeholder={"Data-center capex down >10% y/y\nTwo quarters of revenue misses"} />
            </label>
          </div>
          <button type="button" className="tt-btn tt-btn-primary" onClick={save} disabled={saving || !form.asset.trim() || form.claim.trim().length < 8}>
            {saving ? "Saving…" : "Save thesis"}
          </button>
        </div>
      )}

      {theses === null ? (
        <p className="tt-empty">Loading…</p>
      ) : theses.length === 0 ? (
        <div className="tt-card tt-card-pad">
          <h2>No theses yet</h2>
          <p className="tt-faint">
            Write your first structured thesis above — or ask Black Truffle (◆ button): “Help me draft a thesis on NVDA.” Every thesis records what would
            prove you wrong, which is what makes future reviews honest.
          </p>
        </div>
      ) : (
        <div className="tt-grid">
          {theses.map((t) => (
            <article key={t.id} className="tt-card tt-card-pad">
              <header className="bt-thesis-head">
                <h2>
                  {t.asset} <span className={STATUS[t.status] ?? "tt-pill"}>{t.status}</span>
                </h2>
                <span className="tt-faint">{t.timeHorizon ?? "no horizon"}</span>
              </header>
              <p className="bt-claim">{t.claim}</p>
              {t.supportingEvidence.length > 0 && (
                <div className="bt-evi">
                  <span className="tt-faint">Evidence</span>
                  <ul>{t.supportingEvidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
              {t.invalidationConditions.length > 0 && (
                <div className="bt-evi bt-evi-bad">
                  <span className="tt-faint">Invalidates if</span>
                  <ul>{t.invalidationConditions.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
              <footer className="tt-faint bt-thesis-foot">updated {new Date(t.updatedAt).toLocaleDateString()} {t.confidence != null ? `· confidence ${t.confidence}%` : ""}</footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
