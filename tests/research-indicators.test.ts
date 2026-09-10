import { describe, expect, it } from "vitest";
import {
  rsi,
  sma,
  macdHist,
  realizedVolPct,
  maxDrawdownPct,
  relativeStrength,
  trendRegime,
} from "../core/research/indicators";

const series = (n: number, f: (i: number) => number): number[] => Array.from({ length: n }, (_, i) => f(i));

describe("research indicators", () => {
  it("sma computes a plain average over the window", () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([1, 2, 3], 5)).toBeNull();
  });

  it("rsi is high for a straight uptrend and low for a downtrend", () => {
    expect(rsi(series(30, (i) => 100 + i))).toBeGreaterThan(75);
    expect(rsi(series(30, (i) => 100 - i))).toBeLessThan(25);
    expect(rsi(Array(15).fill(5), 14)).toBe(50);
  });

  it("rsi returns null when there is insufficient data", () => {
    expect(rsi([1, 2, 3], 14)).toBeNull();
  });

  it("macdHist returns null on short series", () => {
    expect(macdHist([1, 2, 3])).toBeNull();
    const h = macdHist(series(60, (i) => 100 + i * 0.5));
    expect(h).not.toBeNull();
  });

  it("realizedVolPct annualizes and is 0 for constant series", () => {
    expect(realizedVolPct([100, 100, 100, 100, 100, 100], 5)).toBe(0);
    expect(realizedVolPct(series(30, (i) => 100 * (1 + (i % 2 === 0 ? 0.02 : -0.02))), 20)).toBeGreaterThan(0);
  });

  it("maxDrawdownPct finds the deepest peak-to-trough decline", () => {
    expect(maxDrawdownPct([100, 120, 90, 95], 4)).toBeCloseTo(-25, 5);
    expect(maxDrawdownPct([100, 110, 120], 3)).toBeCloseTo(0, 5);
  });

  it("relativeStrength is the return spread vs the benchmark", () => {
    const sym = series(30, (i) => 100 * 1.01 ** i);
    const spy = series(30, (i) => 100 * 1.004 ** i);
    const rs = relativeStrength(sym, spy, 21);
    expect(rs).not.toBeNull();
    expect(rs as number).toBeGreaterThan(5);
  });

  it("trendRegime classifies uptrend, downtrend and range", () => {
    expect(trendRegime(105, 100, 95, 110)).toBe("uptrend");
    expect(trendRegime(95, 100, 105, 90)).toBe("downtrend");
    expect(trendRegime(100, 100, 100, 100)).toBe("range");
    expect(trendRegime(100, null, null, 100)).toBeNull();
  });
});
