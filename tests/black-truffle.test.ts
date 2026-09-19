import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-bt-test-"));
process.env.SQLITE_PATH = path.join(tmpDir, "eco.sqlite3");
delete process.env.DATABASE_URL;

import { BlackTruffle } from "../core/eco/blacktruffle";
import { ecoDb } from "../core/eco/store";
import type { EcoDb } from "../core/eco/store";
import type { AIProvider, ChatMessage, ChatOptions } from "../core/research/ai";
import type { AiResult } from "../core/research/ai";

/** Scripted provider: returns queued JSON responses in order, records calls. */
function scriptedProvider(responses: Record<string, unknown>[]) {
  const calls: { messages: ChatMessage[]; opts?: ChatOptions }[] = [];
  let i = 0;
  const provider: AIProvider = {
    kind: "local",
    model: "scripted",
    async chatJson<T>(messages: ChatMessage[], _promptVersion: string, _maxTokens?: number, opts?: ChatOptions): Promise<AiResult<T>> {
      calls.push({ messages, opts });
      const data = responses[Math.min(i++, responses.length - 1)] ?? {};
      return { data: data as T, meta: { provider: "local", model: "scripted", promptVersion: _promptVersion, ts: Date.now(), durationMs: 0, tokensIn: null, tokensOut: null } };
    },
  };
  return { provider, calls };
}

let db: EcoDb;
const U = "bt-user";

beforeAll(() => {
  db = ecoDb();
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // windows file locks — best effort
  }
});

describe("Black Truffle agent", () => {
  it("answers personal questions from retrieved memory, citing tools used", async () => {
    await db.createThesis(U, {
      asset: "NVDA",
      claim: "Datacenter demand keeps revenue compounding",
      timeHorizon: "12 months",
      supportingEvidence: [],
      counterarguments: [],
      keyRisks: [],
      invalidationConditions: ["capex slows"],
      confidence: null,
      status: "active",
    });

    const { provider, calls } = scriptedProvider([
      { tool: "get_theses", args: { asset: "NVDA" } },
      { reply: "You hold one active NVDA thesis: datacenter demand keeps revenue compounding. Invalidation: capex slows." },
    ]);

    const agent = new BlackTruffle(U, provider, db);
    const result = await agent.respond([{ role: "user", content: "What do I think about NVDA right now?" }]);

    expect(result.toolsUsed).toEqual(["get_theses"]);
    expect(result.reply).toContain("datacenter demand");
    // The tool result must have been fed back to the model between rounds.
    expect(calls.length).toBe(2);
    const fedBack = calls[1].messages.some((m) => m.content.includes("TOOL RESULT (get_theses)"));
    expect(fedBack).toBe(true);
  });

  it("reports honestly when the user has no stored history (no fabrication)", async () => {
    const { provider } = scriptedProvider([
      { tool: "get_theses", args: { asset: "TSLA" } },
      { reply: "You have no stored theses for TSLA — I won't invent one." },
    ]);
    const agent = new BlackTruffle("user-with-no-data", provider, db);
    const result = await agent.respond([{ role: "user", content: "What was my thesis on Tesla?" }]);
    expect(result.toolsUsed).toContain("get_theses");
    expect(result.reply).toContain("no stored theses");
  });

  it("executes write tools (create_thesis) against the real store", async () => {
    const { provider } = scriptedProvider([
      { tool: "create_thesis", args: { asset: "AAPL", claim: "Services margin mix lifts overall margins" } },
      { reply: "Thesis recorded for AAPL." },
    ]);
    const agent = new BlackTruffle(U, provider, db);
    await agent.respond([{ role: "user", content: "Black Truffle, add a thesis: AAPL services mix lifts margins." }]);

    const theses = await db.listTheses(U, { asset: "AAPL" });
    expect(theses).toHaveLength(1);
    expect(theses[0].claim).toContain("Services margin mix");
  });

  it("reaches White Truffle through the injected seam (no self-analysis, no network)", async () => {
    const whiteTruffle = vi.fn().mockResolvedValue({
      ticker: "MSFT",
      summary: "Uptrend intact above the 50-day; RSI neutral.",
      lastRun: null,
      runCount: 0,
      errors: [],
    });
    const { provider } = scriptedProvider([
      { tool: "white_truffle", args: { ticker: "MSFT" } },
      { reply: "White Truffle reads MSFT as an intact uptrend above the 50-day." },
    ]);
    const agent = new BlackTruffle(U, provider, db, whiteTruffle);
    const result = await agent.respond([{ role: "user", content: "Ask White Truffle to analyze MSFT." }]);
    expect(whiteTruffle).toHaveBeenCalledWith("MSFT", undefined);
    expect(result.toolsUsed).toContain("white_truffle");
    expect(result.reply).toContain("uptrend");
  });

  it("forces a reply when the tool budget is exhausted", async () => {
    // Every response is a tool call — the loop must terminate and degrade gracefully.
    const { provider } = scriptedProvider(Array.from({ length: 6 }, () => ({ tool: "get_notes", args: {} })));
    const agent = new BlackTruffle(U, provider, db);
    const result = await agent.respond([{ role: "user", content: "Summarize my research." }]);
    expect(result.toolsUsed.length).toBeLessThanOrEqual(4); // MAX_TOOL_ROUNDS + 1 budget
    expect(result.reply.length).toBeGreaterThan(0);
  });
});
