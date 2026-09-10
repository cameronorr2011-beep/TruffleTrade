import { beforeEach, describe, expect, it } from "vitest";
import { checkKillSwitch, planOrder, shouldExit } from "../core/risk";
import type { AccountState, CouncilDecision, MarketSnapshot } from "../core/types";

const snap = (): MarketSnapshot => ({
  ts: Date.now(),
  btcPrice: 60_000,
  candles1h: Array.from({ length: 60 }, (_, i) => ({
    ts: i * 3600_000,
    open: 60_000,
    high: 60_100,
    low: 59_900,
    close: 60_000,
    volume: 10,
  })),
  candles1d: Array.from({ length: 60 }, (_, i) => ({
    ts: i * 86_400_000,
    open: 60_000,
    high: 60_100,
    low: 59_900,
    close: 60_000,
    volume: 100,
  })),
  realizedVol1hPct: 0.5,
  realizedVol1dPct: 2,
  featurePack: {
    price: 60_000, sma20: 59_800, sma50: 59_500, ema12: 60_000, ema26: 59_900,
    rsi14: 55, macd: 5, macdSignal: 4, macdHist: 1, atr14: 200, atrPct: 0.33,
    bbUpper: 60_400, bbLower: 59_600, bbPctB: 0.5,
    donchian20High: 60_100, donchian20Low: 59_900,
    volZ: 0, ret1h: 0, ret24h: 0.3, ret7d: 1, ret30d: 3, hh50: false, ll50: false,
  },
  macro: {
    spy: { symbol: "SPY", price: 500, changePct: 0.2 },
    vixy: { symbol: "VIXY", price: 30, changePct: -0.5 },
    dxy: { symbol: "DX-Y.NYB", price: 104, changePct: -0.1 },
    riskOn: true,
    btcSpyCorrelation: 0.3,
  },
  sources: ["test"],
});

const account = (): AccountState => ({
  equityUsd: 10_000,
  cashUsd: 10_000,
  position: { side: "flat", qtyBtc: 0, entryPrice: 0, openedTs: 0 },
  peakEquityUsd: 10_000,
  halted: false,
});

const decision = (side: "buy" | "sell" | "hold", conviction = 0.7): CouncilDecision => ({
  side,
  conviction,
  entry: null, stop: null, target: null, riskUsd: null,
  rationale: "test", votes: [], redTeam: { approved: true, confidence: 0.8, objections: [], notes: "" },
  model: "test",
});

describe("planOrder", () => {
  it("declines low-conviction decisions", () => {
    expect(planOrder(snap(), decision("buy", 0.2), account())).toBeNull();
  });
  it("sizes a long within 35% notional cap", () => {
    const plan = planOrder(snap(), decision("buy"), account());
    expect(plan).not.toBeNull();
    expect(plan!.side).toBe("buy");
    expect(plan!.qtyBtc * 60_000).toBeLessThanOrEqual(10_000 * 0.35 + 1e-6);
    expect(plan!.stop).toBeLessThan(60_000);
    expect(plan!.target).toBeGreaterThan(60_000);
  });
  it("never pyramids an existing long", () => {
    const a = account();
    a.position = { side: "long", qtyBtc: 0.01, entryPrice: 59_000, openedTs: Date.now() };
    expect(planOrder(snap(), decision("buy"), a)).toBeNull();
  });
  it("exits a long when the council votes sell", () => {
    const a = account();
    a.position = { side: "long", qtyBtc: 0.01, entryPrice: 59_000, openedTs: Date.now() };
    const plan = planOrder(snap(), decision("sell"), a);
    expect(plan).not.toBeNull();
    expect(plan!.qtyBtc).toBe(0.01);
    expect(plan!.note).toContain("exit");
  });
  it("does nothing on a flat sell", () => {
    expect(planOrder(snap(), decision("sell"), account())).toBeNull();
  });
});

describe("shouldExit", () => {
  it("stops out below entry - 2×ATR", () => {
    const a = account();
    a.position = { side: "long", qtyBtc: 0.01, entryPrice: 60_000, openedTs: Date.now() };
    const s = snap();
    s.btcPrice = 59_500; // below 60_000 - 2*200
    const r = shouldExit(s, a);
    expect(r.exit).toBe(true);
    expect(r.reason).toContain("stop");
  });
  it("takes profit above entry + 3×ATR", () => {
    const a = account();
    a.position = { side: "long", qtyBtc: 0.01, entryPrice: 60_000, openedTs: Date.now() };
    const s = snap();
    s.btcPrice = 60_700;
    const r = shouldExit(s, a);
    expect(r.exit).toBe(true);
    expect(r.reason).toContain("target");
  });
  it("holds inside the band", () => {
    const a = account();
    a.position = { side: "long", qtyBtc: 0.01, entryPrice: 60_000, openedTs: Date.now() };
    expect(shouldExit(snap(), a).exit).toBe(false);
  });
  it("time-stops after 96h", () => {
    const a = account();
    a.position = { side: "long", qtyBtc: 0.01, entryPrice: 60_000, openedTs: Date.now() - 97 * 3600_000 };
    const r = shouldExit(snap(), a);
    expect(r.exit).toBe(true);
    expect(r.reason).toContain("time");
  });
});

describe("checkKillSwitch", () => {
  it("halts at 15% drawdown from peak", () => {
    const a = account();
    a.peakEquityUsd = 10_000;
    a.equityUsd = 8_499;
    const r = checkKillSwitch(a);
    expect(r.halt).toBe(true);
    expect(r.reason).toContain("kill switch");
  });
  it("stays armed within the band", () => {
    const a = account();
    a.peakEquityUsd = 10_000;
    a.equityUsd = 9_500;
    expect(checkKillSwitch(a).halt).toBe(false);
  });
});

beforeEach(() => {
  process.env.BROKER_MODE = "paper";
  process.env.KILL_SWITCH_DD = "0.15";
});
