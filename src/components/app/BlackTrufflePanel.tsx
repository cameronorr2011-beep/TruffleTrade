"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { authHeaders, getAccessCode, setAccessCode, clearAccessCode } from "@/lib/accessCodeClient";
import AccessCodeDialog from "@/components/research/AccessCodeDialog";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[]; memory?: string[] };
type Phase = "chat" | "need-key" | "checking";

/** Example commands the spec calls out — one tap instead of typing. */
const EXAMPLES = [
  { label: "Show my active theses", prompt: "Show me my active theses." },
  { label: "Summarize my research this week", prompt: "Summarize my research from my journal and notes this week." },
  { label: "What have I learned?", prompt: "What have I learned so far? Summarize my learning progress." },
] as const;

/** Map the current route to a short context string the agent can use. */
function contextForPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const page = parts[1] ?? "dashboard";
  const ticker = parts[2]?.toUpperCase();
  if (ticker && /^[A-Z0-9.^=-]{1,6}$/.test(ticker)) return `${page} page, ticker ${ticker}`;
  return `${page} page`;
}

/**
 * Black Truffle — the personal assistant & ecosystem orchestrator.
 * Distinct from White Truffle (the market specialist on /analyst): this panel
 * remembers the user's theses, journal, notes, and learning, and can delegate
 * chart analysis to White Truffle via its white_truffle tool.
 */
export default function BlackTrufflePanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("checking");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyDialog, setKeyDialog] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, open, busy]);

  // Open optimistically: on the operator's own machine (loopback) the eco
  // APIs work without a key, so we only gate when an API call is rejected.
  useEffect(() => {
    if (!open) return;
    setPhase((p) => (p === "checking" ? "chat" : p));
  }, [open]);

  const saveKey = useCallback((code: string) => {
    setAccessCode(code);
    setKeyDialog(false);
    setPhase("chat"); // revalidation happens server-side on the next call
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setError(null);
      const next = [...messages, { role: "user" as const, content: trimmed }];
      setMessages(next);
      setInput("");
      setBusy(true);
      try {
        const res = await fetch("/api/eco/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), context: contextForPath(pathname) }),
        });
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          // Public deployment without a valid code — offer activation.
          setPhase("need-key");
          setKeyDialog(true);
          return;
        }
        const j = (await res.json()) as { ok?: boolean; reply?: string; toolsUsed?: string[]; memoryUsed?: string[]; error?: string };
        if (!j.ok) throw new Error(j.error ?? "Black Truffle is unavailable right now.");
        setMessages((m) => [...m, { role: "assistant", content: j.reply ?? "", tools: j.toolsUsed, memory: j.memoryUsed }]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, pathname],
  );

  if (!open) {
    return (
      <button type="button" className="bt-fab" onClick={() => setOpen(true)} aria-label="Open Black Truffle assistant">
        <span aria-hidden>◆</span>
        <span className="bt-fab-label">Black Truffle</span>
      </button>
    );
  }

  return (
    <aside className="bt-panel" aria-label="Black Truffle assistant">
      <header className="bt-panel-head">
        <div>
          <h2>
            BLACK TRUFFLE <span className="bt-tag">personal AI</span>
          </h2>
          <p>Your memory, research, learning, and TruffleTrade ecosystem.</p>
        </div>
        <button type="button" className="tt-btn tt-btn-ghost bt-close" onClick={() => setOpen(false)} aria-label="Close panel">
          ✕
        </button>
      </header>

      <div className="bt-panel-note">
        Need a chart read? That&apos;s <strong>White Truffle</strong> — the specialist on <a href="/analyst">AI Analyst</a>. Black Truffle can request one
        for you.
      </div>

      {phase === "need-key" ? (
        <div className="bt-thread">
          <p className="tt-empty">Activate TruffleTrade AI to use Black Truffle. Your memory, theses, and journal stay yours.</p>
          <button
            type="button"
            className="tt-btn tt-btn-primary"
            onClick={() => {
              clearAccessCode();
              setKeyDialog(true);
            }}
          >
            Enter access code
          </button>
        </div>
      ) : (
        <>
          <div className="bt-thread" ref={scroller}>
            {messages.length === 0 && (
              <div className="bt-empty">
                <p className="tt-empty">Ask about your own research, or try:</p>
                <div className="bt-examples">
                  {EXAMPLES.map((e) => (
                    <button key={e.label} type="button" onClick={() => send(e.prompt)}>
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bt-msg bt-${m.role}`}>
                {m.role === "assistant" && (m.tools?.length || m.memory?.length) ? (
                  <p className="bt-tools">
                    {m.tools?.length ? `tools: ${m.tools.join(", ")}` : ""}
                    {m.memory?.length ? ` · ${m.memory.join(" · ")}` : ""}
                  </p>
                ) : null}
                <p>{m.content}</p>
              </div>
            ))}
            {(busy || phase === "checking") && <p className="bt-msg bt-assistant bt-thinking">Retrieving your memory…</p>}
          </div>

          {error && <p className="tt-error bt-error">{error}</p>}

          <form
            className="bt-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={busy ? "Working…" : "Ask Black Truffle…"}
              disabled={busy || phase !== "chat"}
              maxLength={2000}
            />
            <button type="submit" className="tt-btn tt-btn-primary" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
        </>
      )}

      <AccessCodeDialog
        open={keyDialog}
        onSubmit={saveKey}
        onCancel={() => setKeyDialog(false)}
        title="Activate Black Truffle"
        blurb="Paste the TT-XXXX-XXXX-XXXX-XXXX key from your purchase. It stays on this device and unlocks both Truffles."
      />
    </aside>
  );
}
