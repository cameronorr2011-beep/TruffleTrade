// TruffleTrade research engine — the full adversarial pipeline for one ticker.

import type {
  AgentOutput,
  ConfidenceReport,
  ConsensusResult,
  DataPack,
  ResearchRun,
  Thesis,
  ValuationModel,
} from "./types";
import { buildDataPack } from "./datapack";
import { runComps, runDcf, runReverseDcf } from "./valuation";
import { runAgentCouncil } from "./agents";
import { replaySetup, backtestContext } from "./backtest";
import { buildConfidence, buildConsensus, allPromptVersions } from "./consensus";
import { makeProvider } from "./ai";
import { buildThesis, nullThesis } from "./thesis";
import { buildValuationContext, memoryContext } from "./context";

export interface ResearchOptions {
  ticker: string;
  peers: string[];
  depth: "standard" | "quick";
  /** The caller's verified access code — threaded to the AI gateway. Required unless the operator holds GROQ_API_KEY. */
  accessCode?: string;
}

export async function runResearch(opts: ResearchOptions): Promise<ResearchRun> {
  const started = Date.now();
  const errors: string[] = [];
  const ticker = opts.ticker.toUpperCase().trim();

  const pack = await buildDataPack(ticker);
  if (pack.quote.price == null) errors.push("quote unavailable — analysis degraded");

  // Valuation models are deterministic — run before agents so they can attack assumptions.
  const dcf = runDcf(pack);
  const reverseDcf = runReverseDcf(pack, dcf.dcf);
  const peers = opts.peers.length
    ? await Promise.all(opts.peers.slice(0, 4).map((p) => buildDataPack(p).catch(() => null)))
    : [];
  const comps = runComps(pack, peers.filter((p): p is DataPack => Boolean(p)));
  const valuation: ValuationModel = {
    dcf: dcf.dcf,
    dcfError: dcf.error,
    reverseDcf,
    comps,
  };

  const valuationContext = buildValuationContext(valuation);
  // Deterministic historical replay feeds the Backtest worker (computed fact, not opinion).
  const bt = replaySetup(pack.candles1d, pack.spyCloses, pack.technicals);
  // What this installation already learned about the ticker (prior theses,
  // red-team objections, resolved prediction outcomes) — every analyst and the
  // red team see it, labeled as prior evidence, so the council can't repeat a
  // mistake it has already been graded on.
  const memory = await memoryContext(ticker);
  const provider = makeProvider(opts.accessCode);
  const { agents } = await runAgentCouncil(provider, pack, valuationContext, backtestContext(bt), memory.text || undefined);
  const consensus = buildConsensus(agents);
  const confidence = buildConfidence(pack, agents);

  // Red team veto → no thesis issued; the run stays honest about what it can't support.
  const thesis: Thesis = consensus.redTeamVeto
    ? nullThesis(ticker, consensus.stance)
    : await buildThesis(provider, pack, agents, consensus, valuation);

  const status: ResearchRun["status"] = pack.quote.price == null ? "partial" : "complete";

  // Feed the local memory system (best-effort — a memory failure never
  // degrades the analysis itself; disable with MEMORY_DISABLED=1).
  if (process.env.MEMORY_DISABLED !== "1") {
    try {
      const { ingestRunFacts } = await import("../memory/memory");
      const redTeamAgent = agents.find((a) => /red\s*team/i.test(a.agent));
      const objections = [...(redTeamAgent?.weaknesses ?? []), ...(redTeamAgent?.assumptions ?? [])].slice(0, 6);
      ingestRunFacts({
        ticker,
        runId: null, // caller updates this after saveResearchRun assigns the id
        consensus: { stance: consensus.stance, score: consensus.score },
        thesisSummary: thesis.summary,
        redTeamObjections: objections,
        facts: agents
          .flatMap((a) => a.strengths.slice(0, 2).map((s) => `${a.agent}: ${s}`))
          .slice(0, 12),
        ts: Date.now(),
      });
    } catch (err) {
      errors.push(`memory ingest skipped: ${(err as Error).message}`);
    }
  }

  return {
    id: -1,
    ticker,
    ts: Date.now(),
    status,
    consensus,
    thesis,
    agents,
    valuation,
    dataPack: pack,
    forecast: makeForecast(consensus, pack, confidence),
    promptVersions: allPromptVersions(),
    durationMs: Date.now() - started,
    errors,
  };
}

function makeForecast(
  consensus: ConsensusResult,
  pack: DataPack,
  confidence: ConfidenceReport,
): ResearchRun["forecast"] {
  if (consensus.redTeamVeto || consensus.stance === "neutral") return null;
  if (confidence.level === "low") return null; // never forecast on thin evidence
  return {
    direction: consensus.stance === "bullish" ? "up" : "down",
    horizonDays: 90,
    expectedMovePct: null, // direction only — magnitudes are fabricated confidence (§13)
    priceAtForecast: pack.quote.price ?? 0,
  };
}

export type { AgentOutput };
