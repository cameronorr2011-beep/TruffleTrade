import { describe, expect, it } from "vitest";
import { atr, buildFeatures, macd, realizedVolPct, rsi, sma } from "../core/indicators";
import type { Candle } from "../core/types";

const ramp = (n: number, from = 100): number[] => Array.from({ length: n }, (_, i) => from + i);

const candles = (closes: number[]): Candle[] =>
  closes.map((c, i) => ({ ts: i * 3600_000, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 10 + i }));

describe("rsi", () => {
  it("returns 50 neutral with insufficient data", () => {
    expect(rsi([1, 2, 3])).toBe(50);
  });
  it("returns 100 for a pure uptrend", () => {
    expect(rsi(ramp(20))).toBe(100);
  });
  it("returns 0 for a pure downtrend", () => {
    expect(rsi(ramp(20, 500).map((v) => 600 - v))).toBe(0);
  });
  it("sits mid-range for flat data", () => {
    expect(rsi(Array(20).fill(100))).toBe(50);
  });
});

describe("sma / macd / atr", () => {
  it("sma averages the last N", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
  });
  it("sma falls back to last value when short", () => {
    expect(sma([42], 10)).toBe(42);
  });
  it("macd is zero without enough data", () => {
    expect(macd([1, 2, 3])).toEqual({ macd: 0, signal: 0, hist: 0 });
  });
  it("macd line leads price upward in an uptrend", () => {
    const m = macd(ramp(60));
    expect(m.macd).toBeGreaterThan(0);
    expect(m.hist).toBeGreaterThan(0);
  });
  it("atr is positive on moving candles", () => {
    expect(atr(candles(ramp(30)))).toBeGreaterThan(0);
  });
});

describe("realizedVolPct", () => {
  it("is 0 for flat prices", () => {
    expect(realizedVolPct(Array(30).fill(100), 14)).toBe(0);
  });
  it("is positive for volatile series", () => {
    const v = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    expect(realizedVolPct(v, 14)).toBeGreaterThan(0);
  });
});

describe("buildFeatures", () => {
  const closes = ramp(120);
  const f = buildFeatures(candles(closes), candles(ramp(60)));
  it("uses the latest close as price", () => {
    expect(f.price).toBe(closes[closes.length - 1]);
  });
  it("keeps bollinger %B within [0,1]-ish for a ramp", () => {
    expect(f.bbPctB).toBeGreaterThan(0);
    expect(f.bbUpper).toBeGreaterThan(f.bbLower);
  });
  it("flags a 50-day high on a ramp", () => {
    expect(f.hh50).toBe(true);
    expect(f.ll50).toBe(false);
  });
});
