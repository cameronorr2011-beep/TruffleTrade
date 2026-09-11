import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-licensing-test-"));
process.env.SQLITE_PATH = path.join(tmpDir, "licensing.sqlite3");
process.env.LICENSE_HMAC_KEY = "test-hmac-key-for-vitest-only";
delete process.env.DATABASE_URL; // force SQLite backend

const { licensingDb, dbKind } = await import("../core/licensing/db");
const { generateAccessCode, hashCode } = await import("../core/licensing/codes");

describe("licensing store (sqlite backend)", () => {
  it("reports sqlite backend when DATABASE_URL is unset", () => {
    expect(dbKind()).toBe("sqlite");
  });

  it("creates, pays, and fulfills an order with a code", async () => {
    const db = licensingDb();
    const orderId = "a1b2c3d4e5f6a7b8c9d0e1f2";
    db.createOrder(orderId, "charge-123", Date.now());
    const order = await db.getOrder(orderId);
    expect(order?.status).toBe("pending");
    expect(order?.paidTs).toBeNull();

    db.setOrderPaid(orderId, Date.now());
    const code = generateAccessCode();
    const hash = hashCode(code);
    const now = Date.now();
    db.createCode({ codeHash: hash, orderId, activatedTs: now, expiresTs: now + 30 * 86_400_000 });
    db.setOrderIssued(orderId, hash);

    const issued = await db.getOrder(orderId);
    expect(issued?.status).toBe("issued");
    const codeRow = await db.getCode(hash);
    expect(codeRow?.orderId).toBe(orderId);
    expect(codeRow?.status).toBe("active");
    expect(codeRow?.expiresTs).toBeGreaterThan(Date.now());
  });

  it("is idempotent on duplicate order and code inserts", async () => {
    const db = licensingDb();
    db.createOrder("ffffffffffffffffffffffff", "charge-dup", Date.now());
    db.createOrder("ffffffffffffffffffffffff", "charge-dup", Date.now());
    expect((await db.getOrder("ffffffffffffffffffffffff"))?.chargeId).toBe("charge-dup");
  });

  it("tracks expiry, revocation, and active counts", async () => {
    const db = licensingDb();
    const code = generateAccessCode();
    const hash = hashCode(code);
    const now = Date.now();
    db.createCode({ codeHash: hash, orderId: "order-x", activatedTs: now, expiresTs: now + 1000 });
    expect(await db.activeCodeCount()).toBeGreaterThanOrEqual(0);

    db.setCodeExpiry(hash, now - 10); // expire it
    const expired = await db.getCode(hash);
    expect(expired?.expiresTs).toBeLessThan(Date.now());

    db.setCodeStatus(hash, "revoked");
    expect((await db.getCode(hash))?.status).toBe("revoked");
  });

  it("stores and retrieves federated updates", async () => {
    const db = licensingDb();
    const batch = [{ subjectHash: "a".repeat(16), kindCounts: { outcome: 3, prediction: 2 } }];
    await db.saveFederationUpdate(Date.now(), "peer123", 5, 20000, JSON.stringify(batch));
    const rows = await db.recentFederationUpdates(10);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const found = rows.find((r) => r.peerHash === "peer123");
    expect(found?.tokens).toBe(5);
    const parsed = JSON.parse(found!.batchJson) as typeof batch;
    expect(parsed[0].kindCounts.outcome).toBe(3);
    await db.pruneFederation(Date.now() + 1000); // prune everything after ts
    expect((await db.recentFederationUpdates(10)).find((r) => r.peerHash === "peer123")).toBeUndefined();
  });
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // windows file locks — best effort
  }
});
