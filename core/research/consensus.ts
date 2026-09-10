// Confidence + consensus engines. No meaningless "AI confidence: 94%" —
// confidence is computed from data quality, agreement, and contradiction (spec §13).

import type { AgentOutput, ConfidenceReport, ConsensusResult, ConsensusLine, DataPack, Evidence, Stance } from "./types";

const STANCE_WEIGHTS: Record<Stance, number> = {
  bullish: 1,
  bearish: -1,
  neutral: 0,
  caution: -0.35,
  "insufficient-evidence": 0,
};

const PROMPT_VERSIONS: Record<string, string> = {
  fundamental: "fundamental-agent-v1.0",
  valuation: "valuation-agent-v1.0",
  technical: "technical-agent-v1.0",
  macro: "macro-agent-v1.0",
  competitive: "competitive-agent-v1.0",
  news: "news-agent-v1.0",
  redteam: "redteam-agent-v1.0",
  thesis: "thesis-engine-v1.0",
};

export function promptVersion(kind: string): string {
  return PROMPT_VERSIONS[kind] ?? `${kind}-agent-v0.x`;
}

export function allPromptVersions(): Record<string, string> {
  return { ...PROMPT_VERSIONS };
}

/** Primary sources weigh more than secondary; derived evidence is neutral (spec §8). */
const SOURCE_QUALITY: Record<Evidence["sourceType"], number> = {
  primary: 1,
  secondary: 0.6,
  derived: 0.75, // deterministic calc on market data — reliable but model-dependent
};

export function evidenceConfidence(e: Evidence): number {
  let c = e.confidence * SOURCE_QUALITY[e.sourceType];
  if (e.publicationDate) {
    const ageDays = (Date.now() - Date.parse(e.publicationDate)) / 86_400_000;
    if (Number.isFinite(ageDays)) c *= Math.max(0.5, 1 - Math.max(0, ageDays - 7) / 180);
  }
  return Math.min(1, Math.max(0, c));
}

export function agentReliability(a: AgentOutput): number {
  // Verified evidence, not raw assertion, drives weight (spec §10).
  const ev = a.evidence.map(evidenceConfidence);
  const evScore = ev.length ? ev.reduce((s, x) => s + x, 0) / ev.length : 0;
  const coverage = Math.min(1, a.evidence.length / 4);
  const factPenalty = Math.min(1, a.violations.length * 0.3);
  return Math.max(0, (0.6 * evScore + 0.4 * coverage) * (1 - factPenalty));
}

export function buildConsensus(agents: AgentOutput[]): ConsensusResult {
  const lines: ConsensusLine[] = agents.map((a) => {
    const rel = agentReliability(a);
    const selfC = Math.min(1, Math.max(0, a.confidence));
    const verified = selfC * (1 - Math.min(1, a.violations.length * 0.35));
    return {
      agent: a.agent,
      stance: a.stance,
      selfConfidence: selfC,
      verifiedConfidence: Math.round(verified * 100) / 100,
      weight: Math.round(rel * 100) / 100,
      weightBreakdown: `evidence quality ${evScoreLabel(a)}, coverage ${a.evidence.length}/4, fact-check violations ${a.violations.length}`,
    };
  });

  let num = 0;
  let den = 0;
  for (const l of lines) {
    num += STANCE_WEIGHTS[l.stance] * l.verifiedConfidence * l.weight;
    den += l.verifiedConfidence * l.weight;
  }
  const score = den > 0 ? num / den : 0;
  const redTeam = agents.find((a) => a.agent === "RedTeam");
  const redTeamVeto = redTeam?.stance === "insufficient-evidence";

  let stance: Stance = "neutral";
  if (!redTeamVeto) {
    if (score >= 0.3) stance = "bullish";
    else if (score <= -0.3) stance = "bearish";
    else if (score <= -0.1) stance = "caution";
  }

  const stances = lines.filter((l) => l.stance !== "insufficient-evidence").map((l) => l.stance);
  const bull = stances.filter((s) => s === "bullish").length;
  const bear = stances.filter((s) => s === "bearish").length;
  const disagreement = bull && bear ? (Math.min(bull, bear) >= 2 ? "high" : "moderate") : bull || bear ? "low" : "moderate";

  const synthesis = redTeamVeto
    ? "Red team judged the evidence insufficient for a stance — REJECT stands. No thesis is issued."
    : `Council score ${score >= 0 ? "+" : ""}${score.toFixed(2)} (${stance}) from ${lines.length} agents; ` +
      `${bull} bullish / ${bear} bearish; disagreement ${disagreement}. Weighted by verified evidence quality, not vote count.`;

  return { stance, score: Math.round(score * 100) / 100, lines, redTeamVeto, synthesis, disagreement };
}

function evScoreLabel(a: AgentOutput): string {
  const ev = a.evidence.map(evidenceConfidence);
  if (!ev.length) return "none";
  const m = ev.reduce((s, x) => s + x, 0) / ev.length;
  return m >= 0.7 ? "high" : m >= 0.4 ? "moderate" : "low";
}

export function buildConfidence(pack: DataPack, agents: AgentOutput[]): ConfidenceReport {
  const av = pack.availability;
  const sections = Object.values(av);
  const dataCompleteness = sections.length ? sections.filter(Boolean).length / sections.length : 0;

  const allEvidence = agents.flatMap((a) => a.evidence);
  const sourceQuality = allEvidence.length
    ? allEvidence.reduce((s, e) => s + SOURCE_QUALITY[e.sourceType], 0) / allEvidence.length
    : 0;

  const ts = pack.quote.asOf ?? 0;
  const ageH = ts ? (Date.now() - ts) / 3_600_000 : 999;
  const recency = Math.max(0, 1 - Math.min(1, ageH / 72));

  const votes = agents.filter((a) => a.stance !== "insufficient-evidence");
  const bull = votes.filter((a) => a.stance === "bullish").length;
  const bear = votes.filter((a) => a.stance === "bearish").length;
  const agreement = votes.length ? 1 - (Math.min(bull, bear) / votes.length) * 2 : 0.5;

  const violations = agents.reduce((s, a) => s + a.violations.length, 0);
  const contradiction = Math.min(1, violations * 0.25 + (bull && bear ? 0.3 : 0));

  const raw = 0.3 * dataCompleteness + 0.25 * sourceQuality + 0.2 * recency + 0.15 * Math.max(0, agreement) + 0.1 * (1 - contradiction);
  const level = raw >= 0.7 ? "high" : raw >= 0.45 ? "moderate" : "low";

  return {
    level,
    dataCompleteness: Math.round(dataCompleteness * 100) / 100,
    sourceQuality: Math.round(sourceQuality * 100) / 100,
    recency: Math.round(recency * 100) / 100,
    agreement: Math.round(Math.max(0, agreement) * 100) / 100,
    contradiction: Math.round(contradiction * 100) / 100,
    breakdown: [
      `data completeness ${(dataCompleteness * 100).toFixed(0)}% of sections available`,
      `source quality ${sourceQuality.toFixed(2)} (primary=1, derived=0.75, secondary=0.6)`,
      `recency ${(recency * 100).toFixed(0)}% (quote as-of age ${ageH < 998 ? `${ageH.toFixed(1)}h` : "unknown"})`,
      `agreement ${agreement.toFixed(2)} across ${votes.length} stances`,
      `contradiction ${contradiction.toFixed(2)} (${violations} fact-check violations)`,
    ],
  };
}
