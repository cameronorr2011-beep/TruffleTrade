// Unit tests for the Blockonomics adapter's pure logic — no network access.
// (Address creation / balance polling hit Blockonomics' REST API and are
// covered by live verification, not unit tests.)

import { describe, expect, it, afterEach } from "vitest";
import {
  chargeIdIsBlockonomics,
  chargeIdForAddress,
  addressFromChargeId,
  blockonomicsEnabled,
  callbackSecret,
  verifyCallbackSecret,
  BTC_AMOUNT,
} from "../core/licensing/blockonomics";
import { chargeIdIsBlink } from "../core/licensing/fulfill";

afterEach(() => {
  delete process.env.BLOCKONOMICS_API_KEY;
  delete process.env.BLOCKONOMICS_CALLBACK_SECRET;
  delete process.env.TT_PAYMENT_MODE;
});

describe("charge id helpers", () => {
  it("round-trips an address through the charge id", () => {
    const addr = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080";
    const id = chargeIdForAddress(addr);
    expect(chargeIdIsBlockonomics(id)).toBe(true);
    expect(addressFromChargeId(id)).toBe(addr);
  });

  it("does not misclassify Blink payment hashes, ZBD ids, or manual ids", () => {
    expect(chargeIdIsBlockonomics("bf6b61f814b2e2284f5cbb7c9f9e67887018ffe3f53bedb9b70dec0a15ebca1c")).toBe(false);
    expect(chargeIdIsBlockonomics("wos-manual-7124dac579829974698eab2a")).toBe(false);
    expect(chargeIdIsBlockonomics("zbd-charge-abc123")).toBe(false);
    expect(chargeIdIsBlockonomics("")).toBe(false);
  });

  it("keeps the Blink classifier in sync with the new prefix", () => {
    expect(chargeIdIsBlink(chargeIdForAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080"))).toBe(false);
  });
});

describe("blockonomicsEnabled", () => {
  it("is true when a key exists and no mode override is set", () => {
    process.env.BLOCKONOMICS_API_KEY = "bnc_test";
    expect(blockonomicsEnabled()).toBe(true);
  });

  it("is false without a key", () => {
    expect(blockonomicsEnabled()).toBe(false);
  });

  it("is false when another flow is forced", () => {
    process.env.BLOCKONOMICS_API_KEY = "bnc_test";
    for (const mode of ["manual", "blink", "zbd"]) {
      process.env.TT_PAYMENT_MODE = mode;
      expect(blockonomicsEnabled()).toBe(false);
    }
  });
});

describe("callback secret", () => {
  it("falls back to the API key when no dedicated secret is set", () => {
    process.env.BLOCKONOMICS_API_KEY = "bnc_fallback_secret";
    expect(callbackSecret()).toBe("bnc_fallback_secret");
  });

  it("prefers the dedicated callback secret", () => {
    process.env.BLOCKONOMICS_API_KEY = "bnc_key";
    process.env.BLOCKONOMICS_CALLBACK_SECRET = "bnc_cb_secret";
    expect(callbackSecret()).toBe("bnc_cb_secret");
  });

  it("verifies in constant time and rejects wrong/missing secrets", () => {
    process.env.BLOCKONOMICS_API_KEY = "correct-secret";
    expect(verifyCallbackSecret("correct-secret")).toBe(true);
    expect(verifyCallbackSecret("wrong-secret")).toBe(false);
    expect(verifyCallbackSecret(null)).toBe(false);
    expect(verifyCallbackSecret("")).toBe(false);
  });
});

describe("pricing constants", () => {
  it("prices 1,000 sats = 0.00001 BTC on-chain", () => {
    expect(BTC_AMOUNT).toBe("0.00001000");
  });
});
