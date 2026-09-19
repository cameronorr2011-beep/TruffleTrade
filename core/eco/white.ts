// White Truffle service layer — the INTERNAL way for Black Truffle (or any
// future surface) to reach the existing specialist analyst.
//
// White Truffle itself lives in src/app/api/analyst/route.ts (draft →
// fact-check → critic pipeline) and must NOT be rebuilt or duplicated here.
// This module composes the same primitives that route uses (analyst context
// builder + AI provider) into a callable service, so the orchestrator can ask
// the specialist for a chart reading. If either system is upgraded later, the
// other keeps working — that is the whole point of the seam.

import { makeProvider } from "@core/research/ai";
import type { ChatMessage } from "@core/research/ai";
import { buildAnalystContext } from "@core/research/context";
import { latestRunForTicker, thesisHistory } from "@core/research/store";

export interface WhiteTruffleResult {
  ticker: string;
  /** Short, self-contained summary of the CURRENT chart read (no user history). */
  summary: string;
  /** The last stored research run's stance, if one exists. */
  lastRun: { ts: number; stance: string; score: number; summary: string } | null;
  /** How many prior research runs exist for this ticker (audit trail). */
  runCount: number;
  errors: string[];
}

/**
 * Ask White Truffle (the specialist) to read a chart.
 * Burns Groq tokens — call sites must already be behind `guard()`.
 */
export async function askWhiteTruffle(ticker: string, question?: string): Promise<WhiteTruffleResult> {
  const clean = ticker.toUpperCase().trim();
  const errors: string[] = [];

  // 1) Market context via the SAME builder the analyst route uses (never invent data).
  const ctx = await buildAnalystContext(clean, question ?? "current chart read");
  for (const e of ctx.errors) errors.push(e);

  // 2) History of stored research runs for this ticker (deterministic, no AI).
  const history = thesisHistory(clean, 10);
  const last = latestRunForTicker(clean);

  // 3) One specialist pass over the context (draft-only: no critic loop here,
  //    the interactive analyst route remains the deep-dive surface).
  let summary = "";
  try {
    const provider = makeProvider();
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are White Truffle, the TruffleTrade stock-chart analyst. Using ONLY the market data provided, " +
          "write a concise (<=140 words) plain-English read of the CURRENT chart: trend, momentum, notable levels, and one risk. " +
          "Separate observation from interpretation. Never promise future returns. No user history exists in this prompt.",
      },
      { role: "user", content: `${question ?? "Analyze the current chart."}\n\n--- MARKET DATA ---\n${ctx.text.slice(0, 20_000)}` },
    ];
    const res = await provider.chatJson<{ reply?: string; analysis?: string; summary?: string; text?: string }>(
      messages,
      "white-truffle-service-v1",
      400,
      { temperature: 0.2 },
    );
    summary = (res.data.reply ?? res.data.analysis ?? res.data.summary ?? res.data.text ?? "").trim();
    if (!summary) throw new Error("white truffle returned empty summary");
  } catch (e) {
    errors.push(`white-truffle ai: ${(e as Error).message}`);
    // Degrade to the deterministic last stored run if AI is unavailable.
    summary = last ? `Latest stored analysis (${new Date(last.ts).toISOString().slice(0, 10)}): ${last.thesis.summary}` : "Analysis unavailable — try again shortly.";
  }

  return {
    ticker: clean,
    summary,
    lastRun: last ? { ts: last.ts, stance: last.consensus.stance, score: last.consensus.score, summary: last.thesis.summary } : null,
    runCount: history.length,
    errors,
  };
}
