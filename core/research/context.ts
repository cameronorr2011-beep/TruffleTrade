// Context assembly for the AI. Everything the model is allowed to reason over
// is computed here, deterministically, and handed to prompts as text — the
// model never fetches anything itself. Shared by the council (engine.ts) and
// the conversational analyst (/api/analyst).

import type { DataPack, ValuationModel } from "./types";
import { buildDataPack } from "./datapack";
import { runComps, runDcf, runReverseDcf } from "./valuation";
import { backtestContext, replaySetup } from "./backtest";
import { primer } from "./prompts";

export interface MemoryLine {
  kind: string;
  content: string;
  ageDays: number;
  confidence: number;
}

/**
 * What this installation previously concluded about a ticker — prior theses,
 * red-team objections, and (most valuable) resolved prediction outcomes.
 * Empty string when the memory store is unavailable (e.g. read-only FS) so
 * callers can splice it in unconditionally.
 */
export async function memoryContext(ticker: string, query?: string, limit = 10): Promise<{ text: string; lines: MemoryLine[] }> {
  if (process.env.MEMORY_DISABLED === "1") return { text: "", lines: [] };
  try {
    // Lazy import: better-sqlite3 is native and must not load in environments
    // where the memory DB cannot exist.
    const mem = await import("../memory/memory");
    const hits = mem.recall({ subjects: [ticker], query, limit, minConfidence: 0.3, maxAgeDays: 400 });
    if (!hits.length) return { text: "", lines: [] };
    const now = Date.now();
    const lines: MemoryLine[] = hits.map((h) => ({
      kind: h.fact.kind,
      content: h.fact.content,
      ageDays: Math.max(0, Math.round((now - h.fact.createdAt) / 86_400_000)),
      confidence: h.fact.confidence,
    }));
    const outcomes = lines.filter((l) => l.kind === "outcome");
    const correct = outcomes.filter((l) => /resolved correct/i.test(l.content)).length;
    const header =
      `MEMORY — what this system previously concluded about ${ticker} (on-device, ${lines.length} facts` +
      (outcomes.length ? `; ${correct}/${outcomes.length} resolved predictions were directionally correct` : "") +
      `). Treat as PRIOR EVIDENCE, not truth: prefer live data when they conflict, and say so when a past call was wrong.`;
    const body = lines.map((l) => `- [${l.kind}, ${l.ageDays}d ago, conf ${l.confidence.toFixed(2)}] ${l.content}`).join("\n");
    return { text: `${header}\n${body}`, lines };
  } catch {
    return { text: "", lines: [] };
  }
}

/** Human-readable valuation block: every assumption exposed (spec §3). */
export function buildValuationContext(v: ValuationModel): string {
  const lines: string[] = [];
  if (v.dcf) {
    const a = v.dcf.assumptions;
    const sens = v.dcf.sensitivity.map((s) => s.fairValue);
    lines.push(
      `DCF model (assumptions exposed): base FCF ${Math.round(a.baseFcf).toLocaleString("en-US")}, ` +
        `growth years 1-5 ${(a.growthYears1to5 * 100).toFixed(1)}%, terminal growth ${(a.growthTerminal * 100).toFixed(1)}%, ` +
        `discount rate ${(a.discountRate * 100).toFixed(1)}%, net debt ${Math.round(a.netDebt).toLocaleString("en-US")}, ` +
        `fair value ${v.dcf.fairValue} (PV explicit ${Math.round(v.dcf.pvExplicit).toLocaleString()}, ` +
        `PV terminal ${Math.round(v.dcf.pvTerminal).toLocaleString()}), sensitivity range ` +
        `${Math.min(...sens)} to ${Math.max(...sens)}.`,
    );
  } else {
    lines.push(`DCF model: NOT APPLICABLE (${v.dcfError ?? "insufficient inputs"}). Do not estimate a fair value.`);
  }
  if (v.reverseDcf) {
    lines.push(
      `Reverse DCF: the current price of ${v.reverseDcf.price} implies ` +
        `${(v.reverseDcf.impliedGrowthYears1to5 * 100).toFixed(1)}% annual FCF growth for 5 years ` +
        `(same discount/terminal assumptions as the DCF). Judge whether that expectation is plausible.`,
    );
  }
  if (v.comps.length) {
    lines.push(
      "Peer comparison:\n" +
        v.comps
          .map((c) => `- ${c.metric}: company ${c.value ?? "unavailable"} vs peer median ${c.peerMedian ?? "unavailable"}: ${c.verdict}`)
          .join("\n"),
    );
  } else {
    lines.push("Peer comparison: unavailable (no peer fundamentals).");
  }
  return lines.join("\n");
}

export interface AnalystContext {
  pack: DataPack;
  text: string;
  sections: string[];
  memory: MemoryLine[];
  lastRun: { ts: number; stance: string; score: number; summary: string; objections: string[] } | null;
  errors: string[];
}

/**
 * Everything the conversational analyst may reason over for one ticker:
 * live primer, deterministic valuation, historical replay of the current
 * setup, the digital-twin forward distribution, on-device memory, and the
 * last council verdict. Each block degrades independently.
 */
export async function buildAnalystContext(ticker: string, query?: string): Promise<AnalystContext> {
  const errors: string[] = [];
  const sections: string[] = [];
  const pack = await buildDataPack(ticker);

  sections.push(`LIVE DATA (retrieved ${new Date(pack.retrievalTs).toISOString()}):\n${primer(pack)}`);

  try {
    const dcf = runDcf(pack);
    const valuation: ValuationModel = {
      dcf: dcf.dcf,
      dcfError: dcf.error,
      reverseDcf: runReverseDcf(pack, dcf.dcf),
      comps: runComps(pack, []),
    };
    sections.push(`VALUATION (deterministic, assumptions exposed):\n${buildValuationContext(valuation)}`);
  } catch (e) {
    errors.push(`valuation: ${(e as Error).message}`);
  }

  try {
    const bt = replaySetup(pack.candles1d, pack.spyCloses, pack.technicals);
    sections.push(`HISTORICAL REPLAY (computed fact, not opinion):\n${backtestContext(bt)}`);
  } catch (e) {
    errors.push(`backtest: ${(e as Error).message}`);
  }

  try {
    const closes = pack.candles1d.map((c) => c.close);
    if (closes.length >= 60 && pack.quote.price != null) {
      const { calibrateTwin, simulatePath, mulberry32 } = await import("../memory/twin");
      const cal = calibrateTwin(closes, "bootstrap");
      const rng = mulberry32(0x5eed ^ closes.length);
      const horizon = 20, paths = 200;
      const finals: number[] = [];
      let worst = 0;
      for (let p = 0; p < paths; p++) {
        const path = simulatePath(cal, horizon, rng);
        let peak = path[0];
        for (const v of path) { peak = Math.max(peak, v); worst = Math.min(worst, (v / peak - 1) * 100); }
        finals.push((path[path.length - 1] / path[0] - 1) * 100);
      }
      finals.sort((a, b) => a - b);
      const q = (k: number) => finals[Math.min(finals.length - 1, Math.floor(k * finals.length))];
      const up = finals.filter((x) => x > 0).length / finals.length;
      sections.push(
        `DIGITAL TWIN (MODEL OUTPUT — a block-bootstrap simulator calibrated on ${cal.sourceCandles} real closes; not a forecast):\n` +
          `- ${horizon}-trading-day return distribution across ${paths} paths: p10 ${q(0.1).toFixed(1)}%, median ${q(0.5).toFixed(1)}%, p90 ${q(0.9).toFixed(1)}%\n` +
          `- share of paths ending higher: ${(up * 100).toFixed(0)}% · worst simulated drawdown ${worst.toFixed(1)}%\n` +
          `- daily sigma ${(cal.sigmaDaily * 100).toFixed(2)}% — use only to frame the RANGE of outcomes, never as a target.`,
      );
    }
  } catch (e) {
    errors.push(`twin: ${(e as Error).message}`);
  }

  const mem = await memoryContext(ticker, query);
  if (mem.text) sections.push(mem.text);

  let lastRun: AnalystContext["lastRun"] = null;
  try {
    const store = await import("./store");
    const run = store.latestRunForTicker(ticker);
    if (run) {
      const rt = run.agents.find((a) => /red\s*team/i.test(a.agent));
      lastRun = {
        ts: run.ts,
        stance: run.consensus.stance,
        score: run.consensus.score,
        summary: run.thesis.summary,
        objections: [...(rt?.weaknesses ?? []), ...(rt?.assumptions ?? [])].slice(0, 5),
      };
      const votes = run.agents.map((a) => `${a.agent} ${a.stance} (${a.confidence.toFixed(2)})`).join(", ");
      sections.push(
        `LAST COUNCIL RUN (${Math.round((Date.now() - run.ts) / 86_400_000)}d ago): consensus ${run.consensus.stance} score ${run.consensus.score.toFixed(2)}.\n` +
          `Votes: ${votes}.\nThesis: ${run.thesis.summary.slice(0, 500)}` +
          (lastRun.objections.length ? `\nRed-team objections: ${lastRun.objections.join(" | ")}` : ""),
      );
    }
  } catch (e) {
    errors.push(`last run: ${(e as Error).message}`);
  }

  return { pack, text: sections.join("\n\n"), sections, memory: mem.lines, lastRun, errors };
}
