// Agent runner: executes the council with evidence extraction and red team.
// The six analysts run IN PARALLEL (each is a delegated subagent with its own
// mandate and prompt version); the shared provider serializes on 429s with
// backoff, and per-agent failures degrade to insufficient-evidence instead of
// killing the run. Red team runs after and can REJECT the whole run.

import type { AgentOutput, DataPack, Evidence, NumericClaim, Stance } from "./types";
import { factCheckAgent, stripViolatedNumbers } from "./factcheck";
import { promptVersion } from "./consensus";
import { ALL_AGENT_SPECS, RED_TEAM_AGENT, agentUser, redTeamUser } from "./prompts";
import type { AIProvider } from "./ai";
import { consumeAiBudget, recordUsage, selectModel } from "./router";
import crypto from "node:crypto";
const requestId = () => crypto.randomUUID();

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
  backtestCtx?: string,
): Promise<CouncilResult> {
  // Delegated subagents: every analyst is an independent worker with its own
  // mandate, fired concurrently. One agent failing never fails the council.
  const council: AgentOutput[] = await Promise.all(
    ALL_AGENT_SPECS.map(
      (spec): Promise<AgentOutput> =>
        (async (): Promise<AgentOutput> => {
      try {
        // Model-router metering (spec §13/§44): hard per-minute AI budget;
        // exhausted budget → agent marked insufficient-evidence (fail closed).
        const sel = selectModel(`agent_${spec.key}`);
        if (!consumeAiBudget()) throw new Error("AI budget exhausted (per-minute cap) — agent skipped");
        const t0 = Date.now();
        const r = await provider.chatJson<RawAgentJson>(
          [
            { role: "system", content: spec.system },
            { role: "user", content: agentUser(spec.key, pack, valuationContext, backtestCtx) },
          ],
          promptVersion(spec.key),
          sel.maxTokens,
        );
        recordUsage({
          requestId: requestId(),
          operation: `agent_${spec.key}`,
          taskClass: sel.taskClass,
          provider: r.meta.provider,
          model: r.meta.model,
          latencyMs: Date.now() - t0,
          tokensIn: r.meta.tokensIn ?? undefined,
          tokensOut: r.meta.tokensOut ?? undefined,
          status: "ok",
        });
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
        recordUsage({
          requestId: requestId(),
          operation: `agent_${spec.key}`,
          taskClass: selectModel(`agent_${spec.key}`).taskClass,
          provider: "groq",
          model: "unreachable",
          latencyMs: 0,
          status: "error",
          failureReason: (err as Error).message,
        });
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
    ),
  );

  // Red team sees the council's raw outputs and attacks (§7).
  const redTeam = await runRedTeam(provider, pack, council);
  return { agents: [...council, redTeam], aiCalls: ALL_AGENT_SPECS.length + 1 };
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
    const sel = selectModel("red_team");
    if (!consumeAiBudget()) throw new Error("AI budget exhausted (per-minute cap) — red team skipped");
    const t0 = Date.now();
    const r = await provider.chatJson<RawAgentJson>(
      [
        { role: "system", content: spec.system },
        { role: "user", content: redTeamUser(pack, agentJson) },
      ],
      promptVersion(spec.key),
      sel.maxTokens,
    );
    recordUsage({
      requestId: requestId(),
      operation: "red_team",
      taskClass: sel.taskClass,
      provider: r.meta.provider,
      model: r.meta.model,
      latencyMs: Date.now() - t0,
      tokensIn: r.meta.tokensIn ?? undefined,
      tokensOut: r.meta.tokensOut ?? undefined,
      status: "ok",
    });
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
