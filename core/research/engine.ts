// WOLFPIT research engine — the full adversarial pipeline for one ticker.

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
import { buildConfidence, buildConsensus, allPromptVersions } from "./consensus";
import { makeProvider } from "./ai";
import { buildThesis, nullThesis } from "./thesis";

export interface ResearchOptions {
  ticker: string;
  peers: string[];
  depth: "standard" | "quick";
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
  const provider = makeProvider();
  const { agents } = await runAgentCouncil(provider, pack, valuationContext);
  const consensus = buildConsensus(agents);
  const confidence = buildConfidence(pack, agents);

  // Red team veto → no thesis issued; the run stays honest about what it can't support.
  const thesis: Thesis = consensus.redTeamVeto
    ? nullThesis(ticker, consensus.stance)
    : await buildThesis(provider, pack, agents, consensus, valuation);

  const status: ResearchRun["status"] = pack.quote.price == null ? "partial" : "complete";

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

function buildValuationContext(v: ValuationModel): string {
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
