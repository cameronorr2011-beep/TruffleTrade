import { describe, expect, it } from "vitest";
import { computeMaxIn, computeMinOut, pickBestTier, toCbbtcUnits, toUsdcUnits } from "../core/dex";

describe("dex helpers", () => {
  it("converts BTC quantities to cbBTC units (8 decimals)", () => {
    expect(toCbbtcUnits(0.001)).toBe(100000n);
    expect(toCbbtcUnits(1)).toBe(100000000n);
  });
  it("converts USD to USDC units (6 decimals)", () => {
    expect(toUsdcUnits(50)).toBe(50000000n);
    expect(toUsdcUnits(12.345678)).toBe(12345678n);
  });
  it("bounds slippage on both sides", () => {
    expect(computeMinOut(1_000_000n, 100)).toBe(990_000n); // accept >= 1% less out
    expect(computeMaxIn(1_000_000n, 100)).toBe(1_010_000n); // pay at most 1% more in
    expect(computeMinOut(1_000_000n, 0)).toBe(1_000_000n);
  });
  it("clamps absurd slippage to 50%", () => {
    expect(computeMinOut(1_000_000n, 99_000)).toBe(500_000n);
  });
  it("picks the tier that pays the least for an exact-output buy", () => {
    const best = pickBestTier(
      [
        { fee: 500, amountIn: 1_010_000n },
        { fee: 3000, amountIn: 1_002_000n },
        { fee: 10000, amountIn: 1_050_000n },
      ],
      "exact-output",
    );
    expect(best.fee).toBe(3000);
  });
  it("picks the tier that receives the most for an exact-input sell", () => {
    const best = pickBestTier(
      [
        { fee: 500, amountOut: 990n },
        { fee: 3000, amountOut: 995n },
        { fee: 10000, amountOut: 980n },
      ],
      "exact-input",
    );
    expect(best.fee).toBe(3000);
  });
  it("refuses to trade with no liquid tier", () => {
    expect(() => pickBestTier([{ fee: 500 }, { fee: 3000 }], "exact-input")).toThrow("no liquid fee tier");
  });
});
