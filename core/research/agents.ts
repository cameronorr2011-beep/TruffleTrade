// Agent runner: executes the council with evidence extraction and red team.
// Council runs sequentially (not parallel) so a run stays under free-tier LLM
// rate limits; the provider retries transient 429/5xx with backoff as backup.
// Red team runs after and can REJECT the whole run.

import type { AgentOutput, DataPack, Evidence, NumericClaim, Stance } from "./types";
import { factCheckAgent, stripViolatedNumbers } from "./factcheck";
import { promptVersion } from "./consensus";
import { ALL_AGENT_SPECS, RED_TEAM_AGENT, agentUser, redTeamUser } from "./prompts";
import type { AIProvider } from "./ai";

const VALID_STANCES: readonly string[] = ["bullish", "bearish", "neutral", "caution", "insufficient-evidence"];

function clampStance(s: unknown): Stance {
  const str = String(s ?? "").toLowerCase().trim();
  return (VALID_STANCES as readonly string[]).includes(str) ? (str as Stance) : "insufficient-evidence";
}

interface RawAgentJson {
  stance?: string;
  confidence?: number;
  rationale?: string;
  strengths?: string[];
  weaknesses?: string[];
  assumptions?: string[];
  objections?: string[];
  requiresReject?: boolean;
}

function asStringArray(x: unknown, max = 6): string[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.slice(0, 300))
    .slice(0, max);
}

/** Evidence records for every numeric claim the agent cited. */
function evidenceFromClaims(claims: NumericClaim[], pack: DataPack, agent: string): Evidence[] {
  return claims.map((c) => ({
    id: `ev-${agent}-${c.metric}-${c.value}`,
    claim: `${c.metric} = ${c.value}`,
    source: pack.quote.source,
    sourceType: "derived" as const,
    publicationDate: null,
    retrievalTs: pack.retrievalTs,
    dataTimestamp: pack.quote.asOf,
    confidence: 0.9,
    agent,
    calculation: `verified against data pack (${pack.ticker})`,
  }));
}

export interface CouncilResult {
  agents: AgentOutput[];
  aiCalls: number;
}

export async function runAgentCouncil(
  provider: AIProvider,
  pack: DataPack,
  valuationContext: string,
): Promise<CouncilResult> {
  const council: AgentOutput[] = [];
  for (const spec of ALL_AGENT_SPECS) {
    council.push(
      await (async (): Promise<AgentOutput> => {
      try {
        const r = await provider.chatJson<RawAgentJson>(
          [
            { role: "system", content: spec.system },
            { role: "user", content: agentUser(spec.key, pack, valuationContext) },
          ],
          promptVersion(spec.key),
          1600,
        );
        const d = r.data;
        const stance = clampStance(d.stance);
        const confidence = Math.min(1, Math.max(0, Number(d.confidence) || 0));
        const rationale = String(d.rationale ?? "").slice(0, 1200);
        const strengths = asStringArray(d.strengths);
        const weaknesses = asStringArray(d.weaknesses);
        const assumptions = asStringArray(d.assumptions);

        // Fact-check against the deterministic data pack (spec §9).
        const draft: AgentOutput = {
          agent: spec.name,
          promptVersion: r.meta.promptVersion,
          stance,
          confidence,
          rationale,
          evidence: [],
          numericClaims: [],
          strengths,
          weaknesses,
          assumptions,
          violations: [],
          model: r.meta.model,
        };
        const fc = factCheckAgent(draft, pack);
        draft.numericClaims = fc.claims;
        draft.violations = fc.violations;
        draft.evidence = evidenceFromClaims(fc.claims, pack, spec.name);
        return draft;
      } catch (err) {
        return {
          agent: spec.name,
          promptVersion: promptVersion(spec.key),
          stance: "insufficient-evidence" as const,
          confidence: 0,
          rationale: `agent failed: ${(err as Error).message}`.slice(0, 400),
          evidence: [] as Evidence[],
          numericClaims: [] as NumericClaim[],
          strengths: [],
          weaknesses: [],
          assumptions: [],
          violations: [],
          model: "unreachable",
        };
      }
      })(),
    );
  }

  // Red team sees the council's raw outputs and attacks (§7).
  const redTeam = await runRedTeam(provider, pack, council);
  return { agents: [...council, redTeam], aiCalls: 7 };
}

async function runRedTeam(provider: AIProvider, pack: DataPack, council: AgentOutput[]): Promise<AgentOutput> {
  const spec = RED_TEAM_AGENT;
  const agentJson = JSON.stringify(
    council.map((a) => ({
      agent: a.agent,
      stance: a.stance,
      confidence: a.confidence,
      rationale: a.rationale,
      strengths: a.strengths,
      weaknesses: a.weaknesses,
      assumptions: a.assumptions,
      violations: a.violations.map((v) => v.claim),
    })),
  );
  try {
    const r = await provider.chatJson<RawAgentJson>(
      [
        { role: "system", content: spec.system },
        { role: "user", content: redTeamUser(pack, agentJson) },
      ],
      promptVersion(spec.key),
      1800,
    );
    const d = r.data;
    const rejected = Boolean(d.requiresReject);
    const stance: Stance = rejected ? "insufficient-evidence" : "caution";
    const draft: AgentOutput = {
      agent: spec.name,
      promptVersion: r.meta.promptVersion,
      stance,
      confidence: Math.min(1, Math.max(0, Number(d.confidence) || 0)),
      rationale: stripViolatedNumbers(String(d.rationale ?? "").slice(0, 1200), []),
      evidence: [],
      numericClaims: [],
      strengths: [],
      weaknesses: [],
      assumptions: [],
      violations: [],
      model: r.meta.model,
    };
    const fc = factCheckAgent(draft, pack);
    draft.violations = fc.violations;
    draft.evidence = evidenceFromClaims(fc.claims, pack, spec.name);
    if (rejected) draft.confidence = 0;
    return draft;
  } catch (err) {
    // Fail-closed: an unreachable red team REJECTS (never approve by default).
    return {
      agent: spec.name,
      promptVersion: promptVersion(spec.key),
      stance: "insufficient-evidence" as const,
      confidence: 0,
      rationale: `red team unreachable: ${(err as Error).message} — fail-closed REJECT`.slice(0, 400),
      evidence: [],
      numericClaims: [],
      strengths: [],
      weaknesses: [],
      assumptions: [],
      violations: [],
      model: "unreachable",
    };
  }
}
