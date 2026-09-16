// Order fulfillment: the single source of truth for turning a paid charge
// into a 30-day access code. Called from the webhook and from the
// status-polling endpoint. Idempotent — an order can only ever produce one code.

import crypto from "node:crypto";
import { hashCode, generateAccessCode } from "./codes";
import { isChargePaid, PRICE_MSATS as ZBD_PRICE_MSATS } from "./zbd";
import { isInvoicePaid, PRICE_SATS as BLINK_PRICE_SATS } from "./blink";
import {
  chargeIdIsBlockonomics,
  isBlockonomicsOrderPaid,
  blockonomicsUnconfirmed,
} from "./blockonomics";
import { licensingDb, type OrderRow } from "./db";
import { settleOrder } from "./settle";
import { auditEvent } from "../audit";

export interface FulfillResult {
  orderId: string;
  status: OrderRow["status"];
  accessCode?: string; // only present the first time (plaintext, shown once)
  alreadyIssued?: boolean;
  paid: boolean;
}

/** Blink orders store the invoice's payment hash in charge_id. */
export function chargeIdIsBlink(chargeId: string): boolean {
  return /^[a-f0-9]{64}$/.test(chargeId);
}

function issueCode(orderId: string): string {
  // Retry generation on the (astronomically unlikely) hash collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateAccessCode();
    const hash = hashCode(code);
    const existing = licensingDb().getCode(hash);
    if (existing) continue;
    const now = Date.now();
    licensingDb().createCode({
      codeHash: hash,
      orderId,
      activatedTs: now,
      expiresTs: now + 30 * 86_400_000, // 30 days
    });
    // Store the plaintext on the order row so the buyer can always retrieve
    // their code from the status endpoint (the tt_codes row stays hashed).
    licensingDb().setOrderIssuedPlain(orderId, hash, code);
    return code;
  }
  throw new Error("could not issue a unique access code after 5 attempts");
}

/**
 * Verify the charge with ZBD (authoritative) and fulfill if paid.
 * Safe to call repeatedly; returns the same state on every call.
 */
export async function verifyAndFulfillOrder(orderId: string): Promise<FulfillResult> {
  const db = licensingDb();
  const order = await db.getOrder(orderId);
  if (!order) throw new Error(`unknown order ${orderId}`);

  if (order.status === "issued" && order.codeHash) {
    return { orderId, status: "issued", paid: true, alreadyIssued: true };
  }

  // Blockonomics orders: authoritative check = confirmed on-chain balance at
  // the order's address. Blink payment hash -> Blink. ZBD charge ids are
  // ZBD's own opaque ids.
  const paid = chargeIdIsBlockonomics(order.chargeId)
    ? await isBlockonomicsOrderPaid(order.chargeId)
    : chargeIdIsBlink(order.chargeId)
      ? await isInvoicePaid(order.chargeId)
      : await isChargePaid(order.chargeId);
  if (!paid) {
    if (order.status === "pending") {
      // keep pending; expiration is handled elsewhere
      return { orderId, status: "pending", paid: false };
    }
    return { orderId, status: order.status, paid: false };
  }

  if (!order.paidTs) {
    await db.setOrderPaid(orderId, Date.now());
    auditEvent("payment_verified", "system", { orderId });
  }

  // Fulfillment is idempotent: if two callers race, the second sees status issued.
  const refreshed = await db.getOrder(orderId);
  if (refreshed && refreshed.codeHash) {
    return { orderId, status: "issued", paid: true, alreadyIssued: true };
  }

  const code = issueCode(orderId);
  // Append-only audit trail (spec §48): license issuance is a critical event.
  auditEvent("license_issued", hashCode(code), { orderId });

  // Blink invoices settle directly on the operator's own Blink wallet and
  // Blockonomics payments land on the operator's own BTC wallet (xpub) —
  // neither has a settlement/payout leg. ZBD orders still route received
  // sats to the operator's Wallet of Satoshi.
  if (!chargeIdIsBlink(order.chargeId) && !chargeIdIsBlockonomics(order.chargeId)) {
    try {
      await settleOrder(orderId);
    } catch {
      // recorded inside settleOrder; retried by the sweep
    }
  }
  return { orderId, status: "issued", paid: true, accessCode: code };
}

/**
 * The complete purchase record (used by the status endpoint): order state +
 * (when issued) a re-derived plaintext code is NOT possible — codes are stored
 * hashed, so the plaintext is only available at issue time. For status polling
 * before issue, we return charge status so the UI can react.
 */
export async function orderStatus(orderId: string): Promise<{
  status: OrderRow["status"];
  paid: boolean;
  chargeStatus?: string;
  accessCode?: string;
  expiresTs?: number;
}> {
  const db = licensingDb();
  const order = await db.getOrder(orderId);
  if (!order) throw new Error(`unknown order ${orderId}`);

  // Manual (Wallet of Satoshi) orders have no ZBD charge to poll.
  if (order.chargeId.startsWith("wos-manual-")) {
    if (order.status === "issued") {
      const code = order.codePlain ?? (await db.getOrderPlainCode(orderId));
      const codeRow = order.codeHash ? await db.getCode(order.codeHash) : null;
      return { status: "issued", paid: true, accessCode: code ?? undefined, expiresTs: codeRow?.expiresTs };
    }
    return { status: order.status, paid: false };
  }

  if (order.status === "issued") {
    // Deliver the app: return the access code + expiry so the UI can show
    // the code and the download/setup steps immediately after payment.
    const code = order.codePlain ?? (await db.getOrderPlainCode(orderId));
    const codeRow = order.codeHash ? await db.getCode(order.codeHash) : null;
    return {
      status: "issued",
      paid: true,
      accessCode: code ?? undefined,
      expiresTs: codeRow?.expiresTs,
    };
  }
  // Blockonomics orders: verify the on-chain confirmed balance. On paid,
  // opportunistically fulfill (callback may be missed — polling keeps this
  // reliable). Before confirmation, report the unconfirmed amount so the UI
  // can show a "payment seen, confirming" state.
  if (chargeIdIsBlockonomics(order.chargeId)) {
    const paid = await isBlockonomicsOrderPaid(order.chargeId);
    if (!paid) {
      const unconfirmed = await blockonomicsUnconfirmed(order.chargeId).catch(() => 0);
      return {
        status: order.status,
        paid: false,
        chargeStatus: unconfirmed > 0 ? "bnc-seen" : "bnc-pending",
      };
    }
    const r = await verifyAndFulfillOrder(orderId);
    if (r.status === "issued") {
      const code = await db.getOrderPlainCode(orderId);
      const codeRow = order.codeHash ? await db.getCode(order.codeHash) : null;
      return { status: "issued", paid: true, accessCode: code ?? undefined, expiresTs: codeRow?.expiresTs };
    }
    return { status: r.status, paid: r.paid, chargeStatus: "bnc-paid" };
  }
  // Blink orders: verify against Blink by payment hash. On PAID, opportunistically
  // fulfill (the webhook may not be configured yet — polling keeps this reliable).
  if (chargeIdIsBlink(order.chargeId)) {
    const paid = await isInvoicePaid(order.chargeId);
    if (!paid) return { status: order.status, paid: false, chargeStatus: "blink-pending" };
    const r = await verifyAndFulfillOrder(orderId);
    if (r.status === "issued") {
      const code = await db.getOrderPlainCode(orderId);
      const codeRow = order.codeHash ? await db.getCode(order.codeHash) : null;
      return { status: "issued", paid: true, accessCode: code ?? undefined, expiresTs: codeRow?.expiresTs };
    }
    return { status: r.status, paid: r.paid, chargeStatus: "blink-paid" };
  }
  const { getCharge } = await import("./zbd");
  const charge = await getCharge(order.chargeId);
  // Opportunistically fulfill if ZBD says paid but the webhook hasn't arrived.
  if (charge.status === "completed" && charge.amount === ZBD_PRICE_MSATS) {
    const r = await verifyAndFulfillOrder(orderId);
    if (r.status === "issued") {
      // Poll path: don't make the buyer's status check wait on settlement —
      // fire it and let the sweep retry if the function freezes first.
      void settleOrder(orderId).catch(() => undefined);
      const code = await db.getOrderPlainCode(orderId);
      const codeRow = order.codeHash ? await db.getCode(order.codeHash) : null;
      return { status: "issued", paid: true, accessCode: code ?? undefined, expiresTs: codeRow?.expiresTs };
    }
    return { status: r.status, paid: r.paid, chargeStatus: charge.status };
  }
  if (charge.status === "expired") {
    await db.setOrderStatus(orderId, "expired");
    return { status: "expired", paid: false, chargeStatus: charge.status };
  }
  return { status: order.status, paid: false, chargeStatus: charge.status };
}

export function renewalCode(codeHash: string): string {
  // Placeholder for explicit-renewal flows; real renewal = new order + new code.
  void codeHash;
  return crypto.randomBytes(8).toString("hex");
}
