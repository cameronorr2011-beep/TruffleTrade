// Unit tests for the Blink payment adapter's pure logic — no network access.
// (Invoice creation / status checks hit Blink's GraphQL API and are covered by
// live verification, not unit tests.)

import { describe, expect, it, afterEach } from "vitest";
import { chargeIdIsBlink } from "../core/licensing/fulfill";
import { blinkEnabled, PRICE_SATS, PRICE_MSATS } from "../core/licensing/blink";

afterEach(() => {
  delete process.env.BLINK_API_KEY;
  delete process.env.TT_PAYMENT_MODE;
});

describe("chargeIdIsBlink", () => {
  it("recognizes a 64-char lowercase hex payment hash", () => {
    expect(chargeIdIsBlink("bf6b61f814b2e2284f5cbb7c9f9e67887018ffe3f53bedb9b70dec0a15ebca1c")).toBe(true);
  });

  it("rejects manual (Wallet of Satoshi) charge ids", () => {
    expect(chargeIdIsBlink("wos-manual-7124dac579829974698eab2a")).toBe(false);
  });

  it("rejects ZBD-style opaque charge ids", () => {
    expect(chargeIdIsBlink("zbd-charge-abc123")).toBe(false);
    expect(chargeIdIsBlink("0246dac579829974698eab2a")).toBe(false); // 24 hex (mongo-style), not 64
  });

  it("rejects uppercase hex and non-hex strings", () => {
    expect(chargeIdIsBlink("BF6B61F814B2E2284F5CBB7C9F9E67887018FFE3F53BEDB9B70DEC0A15EBCA1C")).toBe(false);
    expect(chargeIdIsBlink("g".repeat(64))).toBe(false);
  });
});

describe("blinkEnabled", () => {
  it("is true when a key exists and no mode override is set", () => {
    process.env.BLINK_API_KEY = "blink_test";
    expect(blinkEnabled()).toBe(true);
  });

  it("is false without a key", () => {
    expect(blinkEnabled()).toBe(false);
  });

  it("is false when manual mode is forced", () => {
    process.env.BLINK_API_KEY = "blink_test";
    process.env.TT_PAYMENT_MODE = "manual";
    expect(blinkEnabled()).toBe(false);
  });

  it("is false when zbd mode is forced", () => {
    process.env.BLINK_API_KEY = "blink_test";
    process.env.TT_PAYMENT_MODE = "zbd";
    expect(blinkEnabled()).toBe(false);
  });
});

describe("pricing constants", () => {
  it("prices 1,000 sats and 1,000,000 msats consistently", () => {
    expect(PRICE_SATS).toBe(1_000);
    expect(PRICE_MSATS).toBe("1000000");
  });
});
