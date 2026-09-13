import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// Isolated SQLite store for this test run (mirrors licensing-store.test.ts).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-abuse-test-"));
process.env.SQLITE_PATH = path.join(tmpDir, "abuse.sqlite3");
process.env.LICENSE_HMAC_KEY = "test-hmac-key-for-vitest-only";
delete process.env.DATABASE_URL; // force SQLite backend

const {
  failureCount,
  recordFailure,
  isLockedOut,
  clearFailures,
  ABUSE_THRESHOLD,
  ABUSE_WINDOW_MS,
} = await import("../core/licensing/abuse");
const { validateWithAbuseTracking } = await import("../core/licensing/validate");
const { generateAccessCode, hashCode } = await import("../core/licensing/codes");
const { licensingDb } = await import("../core/licensing/db");

describe("abuse store (sqlite backend)", () => {
  it("threshold and window are configured", () => {
    expect(ABUSE_THRESHOLD).toBe(10);
    expect(ABUSE_WINDOW_MS).toBe(15 * 60_000);
  });

  it("records failures and counts them per IP", async () => {
    await clearFailures();
    expect(await failureCount("1.2.3.4")).toBe(0);
    await recordFailure("1.2.3.4", "TT-AAAA-BBBB-CCCC-DDDD");
    await recordFailure("1.2.3.4", "TT-YYYY-XXXX-WWWW-VVVV");
    expect(await failureCount("1.2.3.4")).toBe(2);
    expect(await failureCount("5.6.7.8")).toBe(0); // no cross-IP bleed
  });

  it("locks an IP after the threshold, then clears", async () => {
    await clearFailures();
    const ip = "9.9.9.9";
    for (let i = 0; i < ABUSE_THRESHOLD - 1; i++) {
      const r = await recordFailure(ip, `TT-TEST-TEST-TEST-00${i}`);
      expect(r.locked).toBe(false);
    }
    expect(await isLockedOut(ip)).toBe(false);
    const final = await recordFailure(ip, "TT-TEST-TEST-TEST-009");
    expect(final.locked).toBe(true);
    expect(await isLockedOut(ip)).toBe(true);
    await clearFailures();
    expect(await isLockedOut(ip)).toBe(false);
  });

  it("truncates over-long presented codes", async () => {
    await clearFailures();
    await recordFailure("7.7.7.7", "X".repeat(500));
    expect(await failureCount("7.7.7.7")).toBe(1);
  });
});

describe("validateWithAbuseTracking", () => {
  beforeAll(async () => {
    await clearFailures();
  });

  it("passes valid codes through untouched", async () => {
    const code = generateAccessCode();
    const db = licensingDb();
    const hash = hashCode(code);
    const now = Date.now();
    db.createCode({ codeHash: hash, orderId: "abuse-test-order", activatedTs: now, expiresTs: now + 3_600_000 });
    const v = await validateWithAbuseTracking(code, "10.0.0.1");
    expect(v.ok).toBe(true);
    expect(await failureCount("10.0.0.1")).toBe(0);
  });

  it("counts malformed/unknown attempts and reports 429 at the threshold", async () => {
    await clearFailures();
    const ip = "10.0.0.2";
    for (let i = 0; i < ABUSE_THRESHOLD - 1; i++) {
      const v = await validateWithAbuseTracking("TT-BAD0-CODE0-BAD0-0000", ip);
      expect(v.ok).toBe(false);
      expect(v.status).toBe(401);
    }
    const v = await validateWithAbuseTracking("TT-BAD0-CODE0-BAD0-0000", ip);
    expect(v.ok).toBe(false);
    expect(v.status).toBe(429);
    expect(v.lockedOut).toBe(true);
  });

  it("does NOT count real-code failures (expired/revoked) toward lockout", async () => {
    await clearFailures();
    const code = generateAccessCode();
    const db = licensingDb();
    const hash = hashCode(code);
    const now = Date.now();
    db.createCode({ codeHash: hash, orderId: "abuse-test-expired", activatedTs: now, expiresTs: now - 1_000 }); // already expired
    const ip = "10.0.0.3";
    for (let i = 0; i < ABUSE_THRESHOLD + 2; i++) {
      const v = await validateWithAbuseTracking(code, ip);
      expect(v.ok).toBe(false);
      expect(v.status).toBe(402); // expired, not 401
    }
    expect(await failureCount(ip)).toBe(0);
    expect(await isLockedOut(ip)).toBe(false);
  });

  it("skips failure tracking when ip is unknown", async () => {
    await clearFailures();
    const v = await validateWithAbuseTracking("TT-BAD0-CODE0-BAD0-0000", null);
    expect(v.ok).toBe(false);
    expect(v.status).toBe(401);
  });
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // windows file locks — best effort
  }
});
