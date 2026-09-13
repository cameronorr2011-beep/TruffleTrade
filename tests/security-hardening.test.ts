import { describe, expect, it, beforeAll } from "vitest";
import { generateAccessCode, verifyAccessCode, hashCode } from "../core/licensing/codes";
import { checkRateLimit, rateLimitConfig } from "../core/licensing/validate";
import { yahooChart } from "../core/research/providers";

// codes.ts fails closed without an HMAC key (correct behavior) — tests set a
// throwaway key; prod values never enter the test process.
beforeAll(() => {
  process.env.LICENSE_HMAC_KEY = "test-hmac-key-security-hardening-only";
});

describe("access code security", () => {
  it("generates 60-bit random bodies — no two codes collide in a large sample", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2_000; i++) seen.add(generateAccessCode());
    expect(seen.size).toBe(2_000);
  });

  it("codes carry a valid HMAC checksum — tampered bodies are rejected", () => {
    const code = generateAccessCode();
    expect(verifyAccessCode(code)).not.toBeNull();
    // flip one body char to another alphabet char
    const body = code.replace("TT-", "").replace(/-/g, "");
    const mutated = "TT-" + (body[0] === "A" ? "B" : "A") + body.slice(1);
    const reformatted = `TT-${mutated.slice(0, 4)}-${mutated.slice(4, 8)}-${mutated.slice(8, 12)}-${mutated.slice(12)}`;
    if (reformatted !== code) expect(verifyAccessCode(reformatted)).toBeNull();
  });

  it("rejects truncated, padded, and garbage inputs", () => {
    const code = generateAccessCode();
    expect(verifyAccessCode(code.slice(0, -2))).toBeNull();
    expect(verifyAccessCode(code + "AAAA")).toBeNull();
    expect(verifyAccessCode("")).toBeNull();
    expect(verifyAccessCode("hunter2")).toBeNull();
  });

  it("hashes are deterministic and never equal the plaintext", () => {
    const code = generateAccessCode();
    const h1 = hashCode(code);
    expect(hashCode(code)).toBe(h1);
    expect(h1).not.toContain(code);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("gateway rate limiter", () => {
  it("blocks after the configured burst and reports a reset window", () => {
    const key = `test:${Math.random()}`;
    const { limit } = rateLimitConfig();
    let blocked = 0;
    for (let i = 0; i < limit + 5; i++) {
      if (!checkRateLimit(key).ok) blocked++;
    }
    expect(blocked).toBe(5);
    const denied = checkRateLimit(key);
    expect(denied.ok).toBe(false);
    expect(denied.resetMs).toBeGreaterThan(0);
  });

  it("tracks buckets independently per key (no cross-user bleed)", () => {
    const a = `test:${Math.random()}`;
    const b = `test:${Math.random()}`;
    for (let i = 0; i < rateLimitConfig().limit; i++) checkRateLimit(a);
    expect(checkRateLimit(a).ok).toBe(false);
    expect(checkRateLimit(b).ok).toBe(true);
  });
});

describe("prior-session change derivation (financial data integrity)", () => {
  it("computes changePct from the previous session close, not the window start", async () => {
    const { quote, candles } = await yahooChart("AAPL", "5d", "1d");
    expect(quote.prevClose).not.toBeNull();
    expect(candles.length).toBeGreaterThanOrEqual(2);
    // With daily bars, prevClose must equal the second-to-last close…
    expect(Math.abs(quote.prevClose! - candles[candles.length - 2].close)).toBeLessThan(0.01);
    // …and changePct must be a one-day move, not a 5-day move.
    const expected = (quote.price! / quote.prevClose! - 1) * 100;
    expect(Math.abs(quote.changePct! - expected)).toBeLessThan(0.01);
    expect(Math.abs(quote.changePct!)).toBeLessThan(15); // sanity: a 5-day drift would often exceed this
  });
});
