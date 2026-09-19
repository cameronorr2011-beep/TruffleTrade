"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders, getAccessCode, setAccessCode, clearAccessCode } from "@/lib/accessCodeClient";
import { BUY_URL } from "@/lib/site-url";
import AccessCodeDialog from "@/components/research/AccessCodeDialog";

type Mode = "analyst" | "devil" | "brief";

interface Thinking {
  plan: string[];
  claims: { text: string; basis: string }[];
  critic: { verdict: string; issues: { severity: string; text: string }[] };
  confidence: number;
  invalidator: string | null;
  factCheck: { verifiedClaims: number; violations: number };
  evidence: string[];
  memoryFacts: number;
  lastRun: { stance: string; score: number; ts: number } | null;
  contextErrors: string[];
  passes: number;
  durationMs: number;
}
type MemoryLine = { kind: string; content: string; ageDays: number; confidence: number };
type Msg = { role: "user" | "assistant"; content: string; thinking?: Thinking; memory?: MemoryLine[]; mode?: Mode };

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "analyst", label: "Analyst", hint: "Balanced, evidence-weighted read. Two passes: draft → red-team critic." },
  { id: "devil", label: "Devil's advocate", hint: "Argues against the prevailing view using the same data." },
  { id: "brief", label: "Brief", hint: "Three bullets, single pass, fastest." },
];

const QUICK_ACTIONS = [
  { label: "Explain This", prompt: "Explain what is driving this ticker right now — price action, technicals, and the news that matters." },
  { label: "What Changed?", prompt: "What changed for this ticker in the last few sessions? Compare the current setup against the recent trend." },
  { label: "Challenge Thesis", prompt: "Argue the bear case against the prevailing view on this ticker. Find the strongest contradictions." },
  { label: "Analyze Risk", prompt: "Analyze the key risks for this ticker: volatility, valuation, concentration, macro sensitivity." },
  { label: "Show Evidence", prompt: "Show the evidence for your view: which numbers from the market context support it, and which contradict it?" },
] as const;

type Phase = "chat" | "need-key" | "checking";

/** Rotating progress copy shown while the analyst works — mirrors the real pipeline. */
const THINKING_STAGES = [
  "assembling the evidence pack · quote, technicals, valuation, replay, twin…",
  "recalling what this system already learned about the ticker…",
  "drafting with high reasoning effort — steelmanning the other side…",
  "red-team critic checking every number and label…",
  "fact-checker stripping anything the data can't support…",
  "calibrating confidence…",
] as const;

/**
 * TruffleTrade AI — the conversational research analyst (premium).
 * Context for the selected ticker is assembled server-side; the client only
 * sends the conversation. The activation dialog collects the access code once
 * (Electron-safe) and the sub stays verifiable via /api/gateway/verify.
 */
export default function AnalystChat({ ticker: initialTicker }: { ticker: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [phase, setPhase] = useState<Phase>("checking");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subInfo, setSubInfo] = useState<{ daysRemaining?: number } | null>(null);
  const [keyDialog, setKeyDialog] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [thinkingStage, setThinkingStage] = useState(0);
  const [mode, setMode] = useState<Mode>("analyst");
  const [openTrace, setOpenTrace] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Cycle the thinking stages while a request is in flight; reset when done.
  useEffect(() => {
    if (!busy) {
      setThinkingStage(0);
      return;
    }
    const t = setInterval(() => setThinkingStage((s) => (s + 1) % THINKING_STAGES.length), 3_000);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    const code = getAccessCode();
    if (!code) {
      setPhase("need-key");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/gateway/verify", { headers: authHeaders(), cache: "no-store" });
        const j = (await res.json()) as { ok: boolean; daysRemaining?: number };
        if (j.ok) {
          setSubInfo({ daysRemaining: j.daysRemaining });
          setPhase("chat");
        } else {
          // Stored key is invalid/expired/revoked — gate now, keep it stored
          // so "Enter activation key" can prefill.
          setPhase("need-key");
        }
      } catch {
        // FAIL CLOSED: if entitlement can't be verified (offline, gateway
        // down), show the gate. The server enforces independently — but the
        // UI must never presume a subscription it cannot confirm.
        setPhase("need-key");
      }
    })();
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Follow ticker picks made in the workspace below (lightweight event bus).
  useEffect(() => {
    const handler = (e: Event) => setTicker((e as CustomEvent<string>).detail);
    window.addEventListener("tt-ticker", handler);
    return () => window.removeEventListener("tt-ticker", handler);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      const next: Msg[] = [...messages, { role: "user", content }];
      setMessages(next);
      setInput("");
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/analyst", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ messages: next.slice(-10).map(({ role, content }) => ({ role, content })), ticker, mode }),
        });
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          setPhase("need-key");
          throw new Error("activation required");
        }
        const j = (await res.json()) as { ok: boolean; reply?: string; error?: string; thinking?: Thinking; memory?: MemoryLine[]; mode?: Mode };
        if (!j.ok || !j.reply) throw new Error(j.error ?? `HTTP ${res.status}`);
        setMessages([...next, { role: "assistant", content: j.reply, thinking: j.thinking, memory: j.memory, mode: j.mode }]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [messages, busy, ticker, mode],
  );

  /** Device deactivation: wipe the stored key — the gate re-appears. */
  const deactivate = useCallback(() => {
    clearAccessCode();
    setSubInfo(null);
    setMessages([]);
    setPhase("need-key");
  }, []);

  const saveKey = useCallback(
    (code: string) => {
      setAccessCode(code);
      setKeyDialog(false);
      setPhase("checking");
      // re-run the gate check with the fresh code
      setTimeout(() => {
        fetch("/api/gateway/verify", { headers: { "x-access-code": code }, cache: "no-store" })
          .then((r) => r.json())
          .then((j: { ok: boolean; daysRemaining?: number }) => {
            if (j.ok) {
              setSubInfo({ daysRemaining: j.daysRemaining });
              setPhase("chat");
            } else {
              setPhase("need-key");
            }
          })
          .catch(() => setPhase("need-key"));
      }, 50);
    },
    [],
  );

  if (phase === "checking") {
    return (
      <section className="tt-card tt-chat">
        <p className="tt-faint tt-loading">Checking TruffleTrade AI entitlement…</p>
      </section>
    );
  }

  if (phase === "need-key") {
    return (
      <section className="tt-card tt-chat-gate">
        <div className="tt-gate-badge">
          <span className="tt-live" style={{ width: 6, height: 6 }} />
          TRUFFLETRADE AI · PREMIUM
        </div>
        <h2>Activate the AI analyst</h2>
        <p className="tt-sub">
          The desktop app is free. The AI is your 1,000 sats/month subscription — enter the activation key from your{" "}
          <a href={BUY_URL} target="_blank" rel="noreferrer">
            purchase
          </a>{" "}
          to unlock the conversational analyst, the council, and the digital twin.
        </p>
        <div className="tt-gate-actions">
          <button type="button" className="tt-btn tt-btn-primary" onClick={() => setKeyDialog(true)}>
            Enter activation key
          </button>
          <a className="tt-btn tt-btn-ghost" href={BUY_URL} target="_blank" rel="noreferrer">
            Get a key — 1,000 sats/mo
          </a>
        </div>
        <AccessCodeDialog
          open={keyDialog}
          onSubmit={saveKey}
          onCancel={() => setKeyDialog(false)}
          title="Activate TruffleTrade AI"
          blurb="Paste the TT-XXXX-XXXX-XXXX-XXXX key from your purchase. It stays on this device and unlocks the premium AI."
        />
      </section>
    );
  }

  return (
    <section className="tt-card tt-chat">
      <div className="tt-chat-head">
        <div>
          <h2 className="tt-chat-title">
            <span className="bt-avatar bt-avatar-white" aria-hidden>W</span> White Truffle
          </h2>
          <p className="tt-chat-sub">
            {ticker
              ? `Evidence pack locked on ${ticker} — live quote, technicals, valuation, replay, twin, memory`
              : "Ask about any ticker — add one above to ground answers in live data"}
            {subInfo?.daysRemaining != null ? ` · ${subInfo.daysRemaining}d remaining` : ""}
          </p>
          <div className="tt-modes" role="tablist" aria-label="Analyst mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                className={`tt-mode ${mode === m.id ? "is-on" : ""}`}
                title={m.hint}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="tt-pill tt-pill-ok">AI ACTIVE</span>
          <button
            type="button"
            className="tt-quick-btn"
            onClick={() => setConfirmOff(true)}
            title="Remove the activation key from this device"
          >
            Deactivate
          </button>
        </div>
      </div>

      <div className="tt-chat-scroll" ref={scroller}>
        {confirmOff && (
          <div className="tt-error" role="alertdialog" aria-label="Confirm deactivation">
            <strong>Deactivate TruffleTrade AI on this device?</strong>
            <span style={{ display: "block", marginTop: 6, lineHeight: 1.55 }}>
              This removes the activation key from this device and locks the AI until you enter it again. Your key
              stays valid until it expires — retrieve it anytime from your order page or the buy page. If you no longer
              have the key, deactivate only when you can re-copy it from your purchase.
            </span>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" className="tt-btn tt-btn-primary" onClick={() => { setConfirmOff(false); deactivate(); }}>
                Yes, deactivate
              </button>
              <button type="button" className="tt-btn tt-btn-ghost" onClick={() => setConfirmOff(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {messages.length === 0 && !confirmOff && (
          <div className="tt-chat-empty">
            <p className="tt-chat-hello">
              White Truffle online{ticker ? ` on ${ticker}` : ""}. I'm your chart specialist — every answer is grounded in live data pulled server-side: quote, technicals, valuation, and your memory of this ticker. Ask me anything.
            </p>
            <div className="tt-quick">
              {QUICK_ACTIONS.map((a) => (
                <button key={a.label} type="button" className="tt-quick-btn" onClick={() => void send(a.prompt)}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`tt-msg ${m.role === "user" ? "tt-msg-user" : "tt-msg-ai"}`}>
            <span className="tt-msg-who">
              {m.role === "user" ? "YOU" : `TT AI${m.mode && m.mode !== "analyst" ? ` · ${m.mode === "devil" ? "DEVIL'S ADVOCATE" : "BRIEF"}` : ""}`}
            </span>
            <p className="tt-msg-body">{m.content}</p>
            {m.thinking && <ThinkingTrace t={m.thinking} memory={m.memory ?? []} open={openTrace === i} onToggle={() => setOpenTrace(openTrace === i ? null : i)} />}
          </div>
        ))}
        {busy && (
          <div className="tt-msg tt-msg-ai tt-msg-working">
            <span className="tt-msg-who">TT AI</span>
            <p className="tt-msg-body">
              <span className="tt-thinking-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span key={thinkingStage} className="tt-thinking-stage">{THINKING_STAGES[thinkingStage]}</span>
            </p>
          </div>
        )}
        {error && <p className="tt-inline-err">{error}</p>}
      </div>

      <form
        className="tt-chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={ticker ? `Ask about ${ticker}…` : "Ask anything — or add a ticker above for live context…"}
          aria-label="Ask the analyst"
          disabled={busy}
        />
        <button type="submit" className="tt-btn tt-btn-primary" disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </form>
      <p className="tt-chat-foot">
        Research, not investment advice. Every answer is drafted with high reasoning effort, reviewed by a red-team critic, and
        number-checked against the live data pack — open “show its work” on any reply.
      </p>
    </section>
  );
}

/** The analyst's visible work: plan, critic findings, verified claims, evidence used, and what it remembers. */
function ThinkingTrace({ t, memory, open, onToggle }: { t: Thinking; memory: MemoryLine[]; open: boolean; onToggle: () => void }) {
  const conf = Math.round(t.confidence * 100);
  const confClass = conf >= 70 ? "is-high" : conf >= 45 ? "is-mid" : "is-low";
  const highIssues = t.critic.issues.filter((i) => i.severity === "high").length;
  return (
    <div className="tt-trace">
      <div className="tt-trace-bar">
        <span className={`tt-conf ${confClass}`} title="Calibrated confidence after critic review and fact-check">
          <i style={{ width: `${conf}%` }} />
          <b>{conf}%</b> confidence
        </span>
        <span className="tt-trace-chip" title="Numeric claims verified against the data pack · unsupported numbers stripped">
          ✓ {t.factCheck.verifiedClaims} verified{t.factCheck.violations ? ` · ${t.factCheck.violations} stripped` : ""}
        </span>
        {t.passes > 1 && (
          <span className="tt-trace-chip" title="Draft → red-team critic → fact-check">
            {t.critic.verdict === "pass" ? "critic: pass" : highIssues ? `critic: ${highIssues} high` : `critic: ${t.critic.issues.length} fixes`}
          </span>
        )}
        {t.memoryFacts > 0 && <span className="tt-trace-chip tt-trace-mem" title="On-device memory facts recalled for this ticker">◈ remembers {t.memoryFacts}</span>}
        <button type="button" className="tt-trace-toggle" onClick={onToggle} aria-expanded={open}>
          {open ? "hide its work" : "show its work"} · {(t.durationMs / 1000).toFixed(1)}s
        </button>
      </div>
      {open && (
        <div className="tt-trace-body">
          {t.plan.length > 0 && (
            <div className="tt-trace-sec">
              <h4>Plan</h4>
              <ol>{t.plan.map((p, i) => <li key={i}>{p}</li>)}</ol>
            </div>
          )}
          {t.claims.length > 0 && (
            <div className="tt-trace-sec">
              <h4>Key claims</h4>
              <ul>
                {t.claims.map((c, i) => (
                  <li key={i}>
                    <span className={`tt-basis tt-basis-${c.basis.toLowerCase()}`}>{c.basis}</span> {c.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {t.critic.issues.length > 0 && (
            <div className="tt-trace-sec">
              <h4>Red-team critic</h4>
              <ul>
                {t.critic.issues.map((c, i) => (
                  <li key={i}>
                    <span className={`tt-basis tt-sev-${c.severity}`}>{c.severity}</span> {c.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {t.invalidator && (
            <div className="tt-trace-sec">
              <h4>What would change this view</h4>
              <p>{t.invalidator}</p>
            </div>
          )}
          <div className="tt-trace-sec">
            <h4>Evidence used</h4>
            <p className="tt-trace-ev">{t.evidence.length ? t.evidence.join(" · ") : "no ticker context — general knowledge only"}</p>
            {t.lastRun && (
              <p className="tt-trace-ev">
                Last council run: {t.lastRun.stance} (score {t.lastRun.score.toFixed(2)}), {Math.round((Date.now() - t.lastRun.ts) / 86_400_000)}d ago
              </p>
            )}
            {t.contextErrors.length > 0 && <p className="tt-trace-ev tt-trace-warn">Unavailable: {t.contextErrors.join("; ")}</p>}
          </div>
          {memory.length > 0 && (
            <div className="tt-trace-sec">
              <h4>What it remembers</h4>
              <ul>
                {memory.map((m, i) => (
                  <li key={i}>
                    <span className="tt-basis tt-basis-mem">{m.kind.replace("_", " ")}</span> {m.content}{" "}
                    <span className="tt-trace-age">{m.ageDays}d ago</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
