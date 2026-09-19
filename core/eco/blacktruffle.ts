// Black Truffle — the personal TruffleTrade assistant & ecosystem orchestrator.
//
// Responsibilities (deliberately separate from White Truffle, the market
// specialist): personal memory retrieval, theses, journal, learning progress,
// research notes, ecosystem navigation, and delegated chart analysis.
//
// Design rules from the spec:
//   * RETRIEVAL, not dumps — only compact, relevant slices of user history are
//     placed in the prompt. The full database is never sent to the model.
//   * NEVER fabricate memory — every tool result is grounded in real rows; the
//     system prompt repeats this and the model may only cite what tools return.
//   * OBSERVED / INTERPRETATION / UNCERTAINTY separation for anything market-
//     related, inherited from the house AI safety rules.
//   * The specialist (White Truffle) is reached ONLY through core/eco/white.ts.

import { makeProvider } from "@core/research/ai";
import type { AIProvider, ChatMessage } from "@core/research/ai";
import { ecoDb } from "./store";
import type { EcoDb } from "./store";
import { askWhiteTruffle } from "./white";

export interface BlackTruffleTurn {
  role: "user" | "assistant";
  content: string;
}

export interface BlackTruffleResult {
  reply: string;
  /** Which tools ran, for UI transparency ("why does it know that?"). */
  toolsUsed: string[];
  /** Human-readable list of what memory was retrieved (shown under the reply). */
  memoryUsed: string[];
  turns: BlackTruffleTurn[];
}

const MAX_TOOL_ROUNDS = 3;

const SYSTEM_PROMPT = `You are BLACK TRUFFLE — the personal TruffleTrade assistant and ecosystem orchestrator.

IDENTITY (never blur these):
- BLACK TRUFFLE = you: personal memory, theses, journal, learning, navigation, orchestration.
- WHITE TRUFFLE = the specialist stock-chart analyst. You did NOT analyze any chart yourself.
  When a user asks about current chart/market reads, call the white_truffle tool and then
  explain its result through the lens of THEIR history. Credit it: "White Truffle's analysis…".

YOUR TOOLS return the user's REAL stored data. Rules:
1. NEVER invent or assume prior analyses, theses, journal entries, or lessons. If a tool
   returns nothing, say honestly that you have no record of it. Empty history is a valid answer.
2. Retrieve before you answer personal questions: if the user asks "what do I think about X",
   call search_memory (and get_theses for X) FIRST, then answer from the results.
3. Be concise, calm, and precise — a premium product, not a chatty bot.
4. Market-related statements must separate OBSERVED (tool data) from INTERPRETATION (your read)
   and UNCERTAINTY (what is unknown). Never present a prediction as certainty. Never execute trades.
5. When the user's question is about how TruffleTrade works, answer briefly and suggest where to go.

AVAILABLE TOOLS
- search_memory(query)        — theses + journal + notes matching a query
- get_theses(asset?)          — user's investment theses (optionally for one asset)
- create_thesis(...)          — record a NEW investment thesis
- get_journal(asset?)         — decision-journal entries (+ recorded outcomes)
- create_journal_entry(...)   — record what the user believed and why
- get_learning()              — lesson progress by topic
- get_notes(query?)           — research notes
- set_pref(key, value)        — remember a durable user preference
- white_truffle(ticker, question?) — delegate CURRENT chart analysis to the specialist

RESPONSE FORMAT (strict): every model response is ONE JSON object, either
  {"tool": "<name>", "args": {...}}   to run a tool, or
  {"reply": "<your answer to the user>"}  when you have enough information.`;

// ── tool implementations (all user-scoped; db is the ONLY data source) ────

interface ToolDef {
  name: string;
  description: string;
  args: string; // JSON schema hint for the model
}

const TOOLS: ToolDef[] = [
  { name: "search_memory", description: "Search the user's theses, journal entries, and research notes for a topic or ticker.", args: '{"query": string}' },
  { name: "get_theses", description: "List the user's investment theses, newest first. Optional asset filter.", args: '{"asset"?: string}' },
  { name: "create_thesis", description: "Record a new investment thesis for the user.", args: '{"asset": string, "claim": string, "time_horizon"?: string, "supporting_evidence"?: string[], "counterarguments"?: string[], "key_risks"?: string[], "invalidation_conditions"?: string[], "confidence"?: number}' },
  { name: "get_journal", description: "List decision-journal entries (with outcomes if recorded). Optional asset filter.", args: '{"asset"?: string}' },
  { name: "create_journal_entry", description: "Record what the user believed, why, and what would prove them wrong.", args: '{"belief": string, "asset"?: string, "reasoning"?: string, "evidence"?: string[], "expectation"?: string, "invalidation"?: string}' },
  { name: "get_learning", description: "Learning progress by topic (attempts, best quiz score).", args: '{}' },
  { name: "get_notes", description: "Research notes, newest first. Optional text filter.", args: '{"query"?: string}' },
  { name: "set_pref", description: "Persist a durable user preference (e.g. favorite topics, explanation depth).", args: '{"key": string, "value": string}' },
  { name: "white_truffle", description: "Ask White Truffle (the specialist) for a CURRENT chart analysis of one ticker.", args: '{"ticker": string, "question"?: string}' },
];

function fmtThesis(t: { id: number; asset: string; claim: string; status: string; timeHorizon: string | null; supportingEvidence: string[]; invalidationConditions: string[]; updatedAt: number }): string {
  return `#${t.id} [${t.status}] ${t.asset} — ${t.claim} (horizon: ${t.timeHorizon ?? "—"}, updated ${new Date(t.updatedAt).toISOString().slice(0, 10)})${t.invalidationConditions.length ? ` · invalidates if: ${t.invalidationConditions.join("; ")}` : ""}`;
}

export class BlackTruffle {
  constructor(
    private readonly userId: string,
    private readonly provider: AIProvider = makeProvider(),
    private readonly db: EcoDb = ecoDb(),
    /** Injectable for tests; production always uses the real White Truffle seam. */
    private readonly whiteTruffle: (ticker: string, question?: string) => ReturnType<typeof askWhiteTruffle> = askWhiteTruffle,
  ) {}

  /** Execute one tool call by name. Every path is scoped to this.userId. */
  private async runTool(name: string, args: Record<string, unknown>): Promise<{ text: string; memoryLine?: string }> {
    const db = this.db;
    switch (name) {
      case "search_memory": {
        const q = String(args.query ?? "").trim();
        if (!q) return { text: "error: query required" };
        const needle = q.toUpperCase();
        const theses = (await db.listTheses(this.userId, { limit: 100 })).filter(
          (t) => `${t.asset} ${t.claim} ${t.supportingEvidence.join(" ")}`.toUpperCase().includes(needle),
        );
        const journal = (await db.listJournal(this.userId, { limit: 200 })).filter(
          (e) => `${e.asset ?? ""} ${e.belief} ${e.reasoning ?? ""}`.toUpperCase().includes(needle),
        );
        const notes = (await db.listNotes(this.userId, 200)).filter(
          (n) => `${n.title} ${n.body}`.toUpperCase().includes(needle),
        );
        const parts = [
          theses.length ? `THESES:\n${theses.slice(0, 5).map(fmtThesis).join("\n")}` : "THESES: none match",
          journal.length ? `JOURNAL:\n${journal.slice(0, 5).map((e) => `- ${new Date(e.ts).toISOString().slice(0, 10)}${e.asset ? ` ${e.asset}` : ""}: ${e.belief}`).join("\n")}` : "JOURNAL: none match",
          notes.length ? `NOTES:\n${notes.slice(0, 5).map((n) => `- ${n.title}: ${n.body.slice(0, 160)}`).join("\n")}` : "NOTES: none match",
        ];
        return { text: parts.join("\n\n"), memoryLine: `search_memory("${q}") → ${theses.length} theses, ${journal.length} journal, ${notes.length} notes` };
      }

      case "get_theses": {
        const asset = typeof args.asset === "string" && args.asset.trim() ? args.asset.trim().toUpperCase() : undefined;
        const theses = await db.listTheses(this.userId, { asset, limit: 20 });
        return {
          text: theses.length
            ? theses.map((t) => fmtThesis(t) + (t.supportingEvidence.length ? `\n   evidence: ${t.supportingEvidence.join("; ")}` : "")).join("\n")
            : `NO THESES STORED${asset ? ` for ${asset}` : ""}.`,
          memoryLine: `get_theses(${asset ?? "all"}) → ${theses.length}`,
        };
      }

      case "create_thesis": {
        const asset = String(args.asset ?? "").trim();
        const claim = String(args.claim ?? "").trim();
        if (!/^[A-Z0-9.^=\-]{1,12}$/i.test(asset) || claim.length < 4) return { text: "error: need a valid asset ticker and a claim of at least a few words" };
        const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 8) : []);
        const id = await db.createThesis(this.userId, {
          asset,
          claim,
          timeHorizon: args.time_horizon ? String(args.time_horizon).slice(0, 60) : null,
          supportingEvidence: arr(args.supporting_evidence),
          counterarguments: arr(args.counterarguments),
          keyRisks: arr(args.key_risks),
          invalidationConditions: arr(args.invalidation_conditions),
          confidence: typeof args.confidence === "number" ? Math.max(0, Math.min(100, Math.round(args.confidence))) : null,
          status: "active",
        });
        return { text: `Thesis #${id} created for ${asset}.`, memoryLine: `create_thesis(${asset}) → #${id}` };
      }

      case "get_journal": {
        const asset = typeof args.asset === "string" && args.asset.trim() ? args.asset.trim().toUpperCase() : undefined;
        const entries = await db.listJournal(this.userId, { asset, limit: 20 });
        return {
          text: entries.length
            ? entries.map((e) => `- ${new Date(e.ts).toISOString().slice(0, 10)}${e.asset ? ` [${e.asset}]` : ""}: believed "${e.belief}"${e.expectation ? ` | expected: ${e.expectation}` : ""}${e.invalidation ? ` | wrong if: ${e.invalidation}` : ""}${e.outcome ? ` | OUTCOME: ${e.outcome.whatHappened}` : " | outcome: not yet recorded"}${e.reasoning ? `\n  reasoning: ${e.reasoning.slice(0, 200)}` : ""}`).join("\n")
            : `NO JOURNAL ENTRIES${asset ? ` for ${asset}` : ""}.`,
          memoryLine: `get_journal(${asset ?? "all"}) → ${entries.length}`,
        };
      }

      case "create_journal_entry": {
        const belief = String(args.belief ?? "").trim();
        if (belief.length < 4) return { text: "error: belief required" };
        const id = await db.createJournalEntry(this.userId, {
          asset: args.asset ? String(args.asset) : null,
          belief,
          reasoning: args.reasoning ? String(args.reasoning) : null,
          evidence: Array.isArray(args.evidence) ? args.evidence.map(String).slice(0, 8) : [],
          expectation: args.expectation ? String(args.expectation) : null,
          invalidation: args.invalidation ? String(args.invalidation) : null,
        });
        return { text: `Journal entry #${id} recorded.`, memoryLine: `create_journal_entry → #${id}` };
      }

      case "get_learning": {
        const prog = await db.lessonProgress(this.userId);
        return {
          text: prog.length ? prog.map((p) => `- ${p.topic}: ${p.attempts} attempt(s), best quiz ${p.bestScore ?? "—"}%`).join("\n") : "NO LESSONS COMPLETED YET.",
          memoryLine: `get_learning → ${prog.length} topics`,
        };
      }

      case "get_notes": {
        const q = typeof args.query === "string" ? args.query.trim().toUpperCase() : "";
        const notes = await db.listNotes(this.userId, 40);
        const filtered = q ? notes.filter((n) => `${n.title} ${n.body}`.toUpperCase().includes(q)) : notes;
        return {
          text: filtered.length ? filtered.slice(0, 8).map((n) => `- ${n.title}: ${n.body.slice(0, 220)}`).join("\n") : (q ? "NO NOTES MATCH." : "NO NOTES STORED."),
          memoryLine: `get_notes(${q || "all"}) → ${filtered.length}`,
        };
      }

      case "set_pref": {
        const key = String(args.key ?? "").trim();
        const value = String(args.value ?? "").trim();
        if (!key || !value) return { text: "error: key and value required" };
        await db.setPref(this.userId, key, value);
        return { text: `Preference saved: ${key}.`, memoryLine: `set_pref(${key})` };
      }

      case "white_truffle": {
        const ticker = String(args.ticker ?? "").trim();
        if (!/^[A-Z0-9.^=\-]{1,12}$/i.test(ticker)) return { text: "error: valid ticker required" };
        try {
          const r = await this.whiteTruffle(ticker, args.question ? String(args.question) : undefined);
          const lastLine = r.lastRun ? ` Last stored run: ${r.lastRun.stance.toUpperCase()} (score ${r.lastRun.score}, ${new Date(r.lastRun.ts).toISOString().slice(0, 10)}).` : " No prior stored research runs for this ticker.";
          return { text: `WHITE TRUFFLE (specialist) on ${r.ticker}: ${r.summary}${lastLine}`, memoryLine: `white_truffle(${r.ticker}) ✓` };
        } catch (e) {
          return { text: `White Truffle unavailable: ${(e as Error).message}` };
        }
      }

      default:
        return { text: `error: unknown tool "${name}"` };
    }
  }

  private toolListForPrompt(): string {
    return TOOLS.map((t) => `- ${t.name}(${t.args}) — ${t.description}`).join("\n");
  }

  /** One orchestrator turn: retrieve → reason → (tool loop) → answer. */
  async respond(history: BlackTruffleTurn[]): Promise<BlackTruffleResult> {
    const db = this.db;
    const toolsUsed: string[] = [];
    const memoryUsed: string[] = [];

    // ── retrieval: cheap, deterministic context ALWAYS included (compact) ──
    const [theses, prefs, convos] = await Promise.all([
      db.listTheses(this.userId, { status: "active", limit: 8 }),
      db.getPrefs(this.userId),
      db.recentConversations(this.userId, 3),
    ]);
    const memoryBlock = [
      theses.length ? `ACTIVE THESES:\n${theses.map((t) => `  ${fmtThesis(t)}`).join("\n")}` : "ACTIVE THESES: none stored.",
      Object.keys(prefs).length ? `PREFERENCES: ${JSON.stringify(prefs)}` : "",
      convos.length ? `RECENT CONVERSATIONS:\n${convos.map((c) => `  - ${c.summary}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");

    // ── agentic loop: model may call tools up to MAX_TOOL_ROUNDS times ──
    // The provider is JSON-mode (response_format: json_object), so the protocol
    // is strictly {tool,args} | {reply} objects (see SYSTEM_PROMPT).
    const messages: ChatMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n=== USER MEMORY (real, retrieved — cite only this) ===\n${memoryBlock || "(empty)"}\n\n=== TOOLS ===\n${this.toolListForPrompt()}` },
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    ];

    let finalReply = "";
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const forceReply = round === MAX_TOOL_ROUNDS;
      if (forceReply) {
        messages.push({ role: "user", content: 'Tool budget exhausted. Respond NOW with {"reply": "..."} using only what you already retrieved.' });
      }
      const res = await this.provider.chatJson<{ tool?: string; args?: Record<string, unknown>; reply?: string }>(
        messages,
        "black-truffle-v1",
        900,
        { temperature: 0.3 },
      );
      const out = res.data ?? {};

      if (!forceReply && out.tool) {
        const result = await this.runTool(out.tool, out.args ?? {});
        toolsUsed.push(out.tool);
        if (result.memoryLine) memoryUsed.push(result.memoryLine);
        messages.push({ role: "assistant", content: JSON.stringify({ tool: out.tool, args: out.args ?? {} }) });
        messages.push({ role: "user", content: `TOOL RESULT (${out.tool}):\n${result.text}\n\nContinue: either another {"tool":...} call or {"reply":...}.` });
        continue;
      }

      finalReply = (out.reply ?? "").trim();
      break;
    }

    if (!finalReply) {
      finalReply = "I ran into trouble completing that. Try rephrasing, or ask White Truffle directly from the Analyst page.";
    }

    // ── optional memory creation: store a compact conversation summary ──
    try {
      const userTurn = [...history].reverse().find((m) => m.role === "user");
      const topicMatch = userTurn?.content.match(/\b([A-Z]{2,5})\b/);
      await db.saveConversationSummary(this.userId, `${userTurn?.content.slice(0, 120) ?? "(continuation)"} → ${finalReply.slice(0, 200)}`, topicMatch?.[1]);
    } catch {
      // memory creation must never break the reply
    }

    return { reply: finalReply, toolsUsed, memoryUsed, turns: history };
  }
}
