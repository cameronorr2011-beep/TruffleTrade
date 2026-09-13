"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders, getAccessCode, setAccessCode } from "@/lib/accessCodeClient";
import AccessCodeDialog from "@/components/research/AccessCodeDialog";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_ACTIONS = [
  { label: "Explain This", prompt: "Explain what is driving this ticker right now — price action, technicals, and the news that matters." },
  { label: "What Changed?", prompt: "What changed for this ticker in the last few sessions? Compare the current setup against the recent trend." },
  { label: "Challenge Thesis", prompt: "Argue the bear case against the prevailing view on this ticker. Find the strongest contradictions." },
  { label: "Analyze Risk", prompt: "Analyze the key risks for this ticker: volatility, valuation, concentration, macro sensitivity." },
  { label: "Show Evidence", prompt: "Show the evidence for your view: which numbers from the market context support it, and which contradict it?" },
] as const;

type Phase = "chat" | "need-key" | "checking";

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
  const scroller = useRef<HTMLDivElement>(null);

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
          setPhase("need-key");
        }
      } catch {
        // gateway unreachable — allow the attempt; the API will judge
        setPhase("chat");
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
          body: JSON.stringify({ messages: next.slice(-10), ticker }),
        });
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          setPhase("need-key");
          throw new Error("activation required");
        }
        const j = (await res.json()) as { ok: boolean; reply?: string; error?: string };
        if (!j.ok || !j.reply) throw new Error(j.error ?? `HTTP ${res.status}`);
        setMessages([...next, { role: "assistant", content: j.reply }]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [messages, busy, ticker],
  );

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
          <a href="/buy" target="_blank" rel="noreferrer">
            purchase
          </a>{" "}
          to unlock the conversational analyst, the council, and the digital twin.
        </p>
        <div className="tt-gate-actions">
          <button type="button" className="tt-btn tt-btn-primary" onClick={() => setKeyDialog(true)}>
            Enter activation key
          </button>
          <a className="tt-btn tt-btn-ghost" href="/buy" target="_blank" rel="noreferrer">
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
          <h2>TruffleTrade AI</h2>
          <p className="tt-chat-sub">
            {ticker ? `Context locked on ${ticker} — live quote, technicals, valuation, headlines` : "Ask about any ticker — add one above to ground answers in live data"}
            {subInfo?.daysRemaining != null ? ` · ${subInfo.daysRemaining}d remaining` : ""}
          </p>
        </div>
        <span className="tt-pill tt-pill-ok">AI ACTIVE</span>
      </div>

      <div className="tt-chat-scroll" ref={scroller}>
        {messages.length === 0 && (
          <div className="tt-chat-empty">
            <p className="tt-chat-hello">
              Research assistant online{ticker ? ` for ${ticker}` : ""}. I read the live market context server-side — ask me anything about it.
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
            <span className="tt-msg-who">{m.role === "user" ? "YOU" : "TT AI"}</span>
            <p className="tt-msg-body">{m.content}</p>
          </div>
        ))}
        {busy && (
          <div className="tt-msg tt-msg-ai tt-msg-working">
            <span className="tt-msg-who">TT AI</span>
            <p className="tt-msg-body">
              <span className="tt-stage-dot" style={{ background: "var(--app-gold)", animation: "tt-stagepulse 1.1s ease-in-out infinite" }} /> pulling live context · reasoning over evidence…
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
      <p className="tt-chat-foot">Research, not investment advice. Answers cite the server-verified market context — the model cannot see your data.</p>
    </section>
  );
}
