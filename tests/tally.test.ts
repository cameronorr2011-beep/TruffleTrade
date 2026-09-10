import { describe, expect, it } from "vitest";
import { tallyVotes } from "../core/tally";
import type { AgentVote } from "../core/types";

const vote = (side: AgentVote["side"], confidence: number, agent = "X"): AgentVote => ({
  agent,
  style: "test",
  side,
  confidence,
  rationale: "",
});

describe("tallyVotes", () => {
  it("holds when the net vote is below the approval threshold", () => {
    const r = tallyVotes([vote("buy", 0.3), vote("sell", 0.2), vote("hold", 0.9)]);
    expect(r.side).toBe("hold");
    expect(r.conviction).toBe(0);
  });

  it("buys when conviction-weighted buy votes dominate", () => {
    const r = tallyVotes([
      vote("buy", 0.9, "Momentum"),
      vote("buy", 0.8, "Flow"),
      vote("buy", 0.7, "Macro"),
      vote("sell", 0.4, "Sentinel"),
      vote("hold", 0.5, "Reversion"),
    ]);
    expect(r.side).toBe("buy");
    expect(r.net).toBeGreaterThanOrEqual(0.5);
    expect(r.conviction).toBeGreaterThan(0.3);
  });

  it("sells when sell votes dominate", () => {
    const r = tallyVotes([vote("sell", 0.95), vote("sell", 0.9), vote("buy", 0.3)]);
    expect(r.side).toBe("sell");
  });

  it("clamps out-of-range confidences", () => {
    // 5 clamps to 1, -1 clamps to 0 → net = 1 ≥ 0.5 → buy
    const r = tallyVotes([vote("buy", 5), vote("buy", -1)]);
    expect(r.side).toBe("buy");
    expect(r.buyWeight).toBe(1);
  });

  it("splits 2-2 with equal weight to hold", () => {
    const r = tallyVotes([vote("buy", 0.8), vote("buy", 0.8), vote("sell", 0.8), vote("sell", 0.8)]);
    expect(r.side).toBe("hold");
    expect(r.net).toBe(0);
  });

  it("returns zero weights for an empty pit", () => {
    const r = tallyVotes([]);
    expect(r.side).toBe("hold");
    expect(r.buyWeight).toBe(0);
    expect(r.sellWeight).toBe(0);
  });
});
