import { describe, expect, it, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// Paper store integration tests — SQLite backend only (same convention as
// tests/licensing-store.test.ts). No network, no live AI.

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-paper-test-"));
process.env.SQLITE_PATH = path.join(tmpDir, "paper.sqlite3");
process.env.LICENSE_HMAC_KEY = "test-hmac-key-for-vitest-only";
delete process.env.DATABASE_URL; // force SQLite backend

const { paperStore } = await import("../core/paper/db");
const { hashCode } = await import("../core/licensing/codes");

const store = paperStore();
const hashA = hashCode("TT-TEST-AAAA-AAAA");
const hashB = hashCode("TT-TEST-BBBB-BBBB");

beforeAll(() => {
  store.getOrCreateAccount(hashA, 100_000, "{}");
  store.getOrCreateAccount(hashB, 50_000, "{}");
});

describe("paper store — accounts", () => {
  it("creates an account once and is idempotent on repeat", async () => {
    const a1 = await store.getOrCreateAccount(hashA, 100_000, "{}");
    const a2 = await store.getOrCreateAccount(hashA, 100_000, "{}");
    expect(a1.id).toBe(a2.id);
    expect(a1.startUsd).toBe(100_000);
  });

  it("keeps different owners in separate accounts (isolation by construction)", async () => {
    const a = await store.getOrCreateAccount(hashA, 100_000, "{}");
    const b = await store.getOrCreateAccount(hashB, 50_000, "{}");
    expect(a.id).not.toBe(b.id);
  });

  it("updates cash and ratchets the peak value upward", async () => {
    const a = await store.getOrCreateAccount(hashA, 100_000, "{}");
    await store.updateAccountCash(a.id, 95_000, 100_000);
    await store.updateAccountCash(a.id, 105_000, 105_000);
    await store.updateAccountCash(a.id, 104_000, 104_000); // peak must stay 105k
    const after = await store.getAccount(hashA);
    expect(after?.cashUsd).toBeCloseTo(104_000, 6);
    expect(after?.peakValueUsd).toBeCloseTo(105_000, 6);
  });
});

describe("paper store — orders and fills", () => {
  it("inserts an order, fills it, and enforces account-scoped reads", async () => {
    const a = await store.getOrCreateAccount(hashA, 100_000, "{}");
    const b = await store.getOrCreateAccount(hashB, 50_000, "{}");

    const orderId = await store.insertOrder({
      accountId: a.id,
      ticker: "AAPL",
      side: "buy",
      type: "market",
      quantity: 10,
      limitPrice: null,
      status: "pending",
      reason: null,
      createdAt: Date.now(),
    });

    // Owner can read it.
    expect(await store.getOrder(a.id, orderId)).not.toBeNull();
    // The other account CANNOT read it — cross-user isolation (spec §24).
    expect(await store.getOrder(b.id, orderId)).toBeNull();

    await store.setOrderStatus(orderId, "filled", null);
    const filled = await store.getOrder(a.id, orderId);
    expect(filled?.status).toBe("filled");

    await store.insertFill({
      orderId,
      ticker: "AAPL",
      side: "buy",
      quantity: 10,
      priceUsd: 100.1,
      feeUsd: 0.5,
      slippageUsd: 1,
      realizedPnlUsd: 0,
      ts: Date.now(),
    });
    const fillsA = await store.recentFills(a.id, 10);
    const fillsB = await store.recentFills(b.id, 10);
    expect(fillsA).toHaveLength(1);
    expect(fillsB).toHaveLength(0); // isolation on fills too
  });

  it("rejects invalid quantities at the schema level (CHECK constraints)", async () => {
    const a = await store.getOrCreateAccount(hashA, 100_000, "{}");
    expect(() =>
      store.insertOrder({
        accountId: a.id,
        ticker: "AAPL",
        side: "buy",
        type: "market",
        quantity: -5, // violates CHECK (quantity > 0)
        limitPrice: null,
        status: "pending",
        reason: null,
        createdAt: Date.now(),
      }),
    ).toThrow();
  });

  it("keeps position quantity at zero-or-above and deletes flat positions", async () => {
    const a = await store.getOrCreateAccount(hashA, 100_000, "{}");
    await store.upsertPosition(a.id, "NVDA", 5, 180.25);
    let rows = await store.positions(a.id);
    expect(rows.find((r) => r.ticker === "NVDA")?.quantity).toBe(5);

    await store.upsertPosition(a.id, "NVDA", 0, 0); // flat → deleted
    rows = await store.positions(a.id);
    expect(rows.find((r) => r.ticker === "NVDA")).toBeUndefined();
  });
});

describe("paper store — audit events (append-only trail)", () => {
  it("records events with actor hashes, never raw codes", async () => {
    await store.audit("paper_fill", hashA, { orderId: 1, ticker: "AAPL" });
    const events = await store.recentAudit(10);
    const mine = events.find((e) => e.event === "paper_fill");
    expect(mine).toBeTruthy();
    expect(mine!.actorHash).toBe(hashA);
    expect(mine!.actorHash).not.toMatch(/TT-/); // no plaintext codes in the audit trail
  });

  it("returns the most recent events first", async () => {
    await store.audit("test_event_first", "system", {});
    await store.audit("test_event_second", "system", {});
    const events = await store.recentAudit(2);
    expect(events[0].event).toBe("test_event_second");
  });
});
