import { describe, expect, it, beforeAll } from "vitest";
import { generateAccessCode, verifyAccessCode, hashCode, orderIdFromInternalId, CODE_ALPHABET } from "../core/licensing/codes";

beforeAll(() => {
  process.env.LICENSE_HMAC_KEY = "test-hmac-key-for-vitest-only";
});

describe("access codes", () => {
  it("generates codes in the TT-XXXX-XXXX-XXXX-XXXX format with valid alphabet", () => {
    const code = generateAccessCode();
    expect(code).toMatch(/^TT-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    for (const ch of code.replace(/-/g, "")) {
      expect(CODE_ALPHABET.includes(ch)).toBe(true);
    }
  });

  it("generates unique codes", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateAccessCode()));
    expect(codes.size).toBe(200);
  });

  it("verifies a valid code and normalizes case/spacing/dashes", () => {
    const code = generateAccessCode();
    expect(verifyAccessCode(code)).toBe(code);
    expect(verifyAccessCode(code.toLowerCase())).toBe(code);
    expect(verifyAccessCode(code.replace(/-/g, " "))).toBe(code);
    expect(verifyAccessCode(`  ${code}  `)).toBe(code);
    expect(verifyAccessCode(code.replace(/-/g, ""))).toBe(code);
  });

  it("rejects tampered codes (any single character change)", () => {
    const code = generateAccessCode();
    for (let i = 0; i < code.length; i++) {
      if (code[i] === "-") continue;
      for (const replacement of ["0", "X", "9"]) {
        if (code[i] === replacement) continue;
        const tampered = code.slice(0, i) + replacement + code.slice(i + 1);
        expect(verifyAccessCode(tampered)).toBeNull();
      }
    }
  });

  it("rejects truncated, extended, and garbage inputs", () => {
    const code = generateAccessCode();
    expect(verifyAccessCode("")).toBeNull();
    expect(verifyAccessCode(code.slice(0, -2))).toBeNull();
    expect(verifyAccessCode(code + "XX")).toBeNull();
    expect(verifyAccessCode("HELLO-WORLD")).toBeNull();
    expect(verifyAccessCode("TT-0000-0000-0000-0000")).toBeNull();
  });

  it("hashes codes deterministically and differently per code", () => {
    const a = generateAccessCode();
    const b = generateAccessCode();
    expect(hashCode(a)).toBe(hashCode(a));
    expect(hashCode(a)).not.toBe(hashCode(b));
    expect(hashCode(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("round-trips order ids through internalId", () => {
    const id = "a1b2c3d4e5f6a7b8c9d0e1f2";
    expect(orderIdFromInternalId(`tt-${id}`)).toBe(id);
    expect(orderIdFromInternalId("not-ours")).toBeNull();
    expect(orderIdFromInternalId("tt-invalid")).toBeNull();
    expect(orderIdFromInternalId(null)).toBeNull();
  });
});
