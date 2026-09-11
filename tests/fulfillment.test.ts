import { describe, expect, it, beforeAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// Fulfillment idempotency (spec §21): a repeated webhook or status poll must
// NEVER create a second license for the same order. ZBD is mocked — the charge
// verification is the only external dependency in the fulfillment path.

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-fulfill-test-"));
process.env.SQLITE_PATH = path.join(tmpDir, "fulfill.sqlite3");
process.env.LICENSE_HMAC_KEY = "test-hmac-key-for-vitest-only";
delete process.env.DATABASE_URL;

vi.mock("../core/licensing/zbd", () => ({
  PRICE_MSATS: 1_000_000,
  createCharge: vi.fn(),
  isChargePaid: vi.fn(async (chargeId: string) => chargeId.startsWith("paid-")),
}));

const { verifyAndFulfillOrder } = await import("../core/licensing/fulfill");
const { licensingDb } = await import("../core/licensing/db");

describe("payment fulfillment — idempotency (spec §21)", () => {
  beforeAll(() => {
    licensingDb().createOrder("order-idem-0001", "paid-charge-1", Date.now());
    licensingDb().createOrder("order-unpaid-01", "unpaid-charge-1", Date.now());
  });

  it("fulfills a paid order exactly once and returns the code once", async () => {
    const first = await verifyAndFulfillOrder("order-idem-0001");
    expect(first.status).toBe("issued");
    expect(first.paid).toBe(true);
    expect(first.accessCode).toMatch(/^TT-/);

    const second = await verifyAndFulfillOrder("order-idem-0001");
    expect(second.status).toBe("issued");
    expect(second.alreadyIssued).toBe(true);
    expect(second.accessCode).toBeUndefined(); // never re-issued

    // The order still points at the FIRST code hash — no duplicate license.
    const order = await licensingDb().getOrder("order-idem-0001");
    expect(order?.status).toBe("issued");
  });

  it("leaves an unpaid order pending with no code issued", async () => {
    const res = await verifyAndFulfillOrder("order-unpaid-01");
    expect(res.paid).toBe(false);
    expect(res.status).toBe("pending");
    const order = await licensingDb().getOrder("order-unpaid-01");
    expect(order?.codeHash).toBeNull();
    expect(order?.codePlain).toBeNull();
  });

  it("throws for unknown orders rather than inventing state", async () => {
    await expect(verifyAndFulfillOrder("no-such-order")).rejects.toThrow(/unknown order/);
  });
});
