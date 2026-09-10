import { describe, expect, it } from "vitest";
import { buildConsensus, agentReliability, evidenceConfidence, buildConfidence } from "../core/research/consensus";
import type { AgentOutput, DataPack, Evidence, Stance } from "../core/research/types";

function ev(over: Partial<Evidence>): Evidence {
  return {
    id: "ev-x",
    claim: "test evidence",
    source: "test",
    sourceType: "primary",
    publicationDate: null,
    retrievalTs: Date.now(),
    dataTimestamp: Date.now(),
    confidence: 1,
    agent: "Test",
    calculation: undefined,
    ...over,
  };
}

function agent(over: Partial<AgentOutput> & { agent: string; stance: Stance }): AgentOutput {
  return {
    promptVersion: "test-v1",
    confidence: 0.8,
    rationale: "test",
    evidence: [],
    numericClaims: [],
    strengths: [],
    weaknesses: [],
    assumptions: [],
    violations: [],
    model: "test",
    ...over,
  };
}

describe("evidence confidence", () => {
  it("weights primary over secondary sources", () => {
    const primary = evidenceConfidence(ev({ sourceType: "primary" }));
    const secondary = evidenceConfidence(ev({ sourceType: "secondary" }));
    expect(primary).toBeGreaterThan(secondary);
  });

  it("decays stale evidence", () => {
    const fresh = evidenceConfidence(ev({ publicationDate: new Date().toISOString() }));
    const old = evidenceConfidence(ev({ publicationDate: new Date(Date.now() - 300 * 86_400_000).toISOString() }));
    expect(fresh).toBeGreaterThan(old);
    expect(old).toBeGreaterThanOrEqual(0.5); // floor keeps it usable but downweighted
  });
});

describe("agent reliability", () => {
  it("is zero with no evidence", () => {
    expect(agentReliability(agent({ agent: "A", stance: "neutral" }))).toBe(0);
  });

  it("falls as fact-check violations accumulate", () => {
    const clean = agent({ agent: "A", stance: "bullish", evidence: [ev({}), ev({}), ev({}), ev({})] });
    const dirty = agent({ ...clean, violations: [{ claim: "x", metric: null, stated: null, actual: null, reason: "contradicted", detail: "" }] });
    expect(agentReliability(clean)).toBeGreaterThan(agentReliability(dirty));
  });
});

describe("council consensus", () => {
  it("is bullish when verified bullish evidence dominates", () => {
    const agents = [
      agent({ agent: "F", stance: "bullish", confidence: 0.9, evidence: [ev({}), ev({}), ev({}), ev({})] }),
      agent({ agent: "V", stance: "bullish", confidence: 0.8, evidence: [ev({}), ev({}), ev({}), ev({})] }),
      agent({ agent: "T", stance: "bearish", confidence: 0.4, evidence: [ev({ confidence: 0.3 })] }),
    ];
    const c = buildConsensus(agents);
    expect(c.stance).toBe("bullish");
    expect(c.score).toBeGreaterThan(0);
    expect(c.redTeamVeto).toBe(false);
  });

  it("red team insufficient-evidence forces a reject regardless of bull votes", () => {
    const agents = [
      agent({ agent: "F", stance: "bullish", confidence: 0.95, evidence: [ev({}), ev({}), ev({}), ev({})] }),
      agent({ agent: "RedTeam", stance: "insufficient-evidence", confidence: 0 }),
    ];
    const c = buildConsensus(agents);
    expect(c.redTeamVeto).toBe(true);
    expect(c.stance).toBe("neutral");
  });

  it("weights a high-reliability bear over a low-reliability bull — not a vote count", () => {
    const strongBear = agent({
      agent: "F", stance: "bearish", confidence: 0.9,
      evidence: [ev({}), ev({}), ev({}), ev({}), ev({}), ev({})],
    });
    const weakBull = agent({
      agent: "T", stance: "bullish", confidence: 0.9,
      evidence: [ev({ sourceType: "secondary", confidence: 0.4 })],
      violations: [{ claim: "x", metric: null, stated: null, actual: null, reason: "contradicted", detail: "" }],
    });
    const c = buildConsensus([weakBull, strongBear]);
    expect(c.stance).toBe("bearish");
  });

  it("records a transparent weight breakdown per agent", () => {
    const c = buildConsensus([agent({ agent: "F", stance: "neutral", evidence: [ev({})] })]);
    expect(c.lines[0].weightBreakdown).toMatch(/evidence quality/);
  });
});

describe("confidence report", () => {
  const pack = {
    ticker: "TEST",
    quote: { ticker: "TEST", name: null, exchange: null, currency: "USD", price: 1, prevClose: null, changePct: null, marketCap: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, asOf: Date.now(), source: "test" },
    candles1d: [],
    technicals: { sma20: null, sma50: null, sma200: null, rsi14: null, macdHist: null, atr14: null, atrPct: null, realizedVol20Pct: null, maxDrawdown30dPct: null, support: null, resistance: null, trendRegime: null, relStrengthVsSpy30d: null, ret1mPct: null, ret3mPct: null, ret12mPct: null, volumeZ: null, bars: 0, asOf: Date.now() },
    fundamentals: null,
    fundamentalsError: null,
    news: [],
    macro: [],
    spyCloses: [],
    retrievalTs: Date.now(),
    sources: ["test"],
    availability: { quote: true, candles: false, technicals: false, fundamentals: false, news: false, macro: false, relativeStrength: false },
  } as unknown as DataPack;

  it("reflects poor data availability in the breakdown", () => {
    const agents = [agent({ agent: "F", stance: "neutral", evidence: [ev({})] })];
    const rep = buildConfidence(pack, agents);
    expect(rep.dataCompleteness).toBeCloseTo(1 / 7, 2);
    expect(rep.breakdown.some((b) => b.includes("completeness"))).toBe(true);
    // High-quality primary evidence with fresh quote can still yield overall moderate/high,
    // but completeness must drag the score — verify weighting is honest, not cherry-picked.
    expect(rep.sourceQuality).toBeGreaterThan(0);
  });

  it("is low when the only evidence is low-quality and stale", () => {
    const stalePack = { ...pack, quote: { ...pack.quote, asOf: Date.now() - 10 * 86_400_000 } } as unknown as DataPack;
    const agents = [agent({ agent: "F", stance: "neutral", evidence: [ev({ sourceType: "secondary", confidence: 0.3 })] })];
    const rep = buildConfidence(stalePack, agents);
    expect(rep.level).toBe("low");
  });

  it("is higher when everything is available and agents agree", () => {
    const full = { ...pack, availability: { quote: true, candles: true, technicals: true, fundamentals: true, news: true, macro: true, relativeStrength: true } } as unknown as DataPack;
    const agents = [
      agent({ agent: "F", stance: "bullish", evidence: [ev({}), ev({}), ev({}), ev({})] }),
      agent({ agent: "V", stance: "bullish", evidence: [ev({}), ev({}), ev({}), ev({})] }),
    ];
    const rep = buildConfidence(full, agents);
    expect(rep.level).not.toBe("low");
  });
});
