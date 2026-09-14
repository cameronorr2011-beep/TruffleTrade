// Settlement: routes received sats to the operator's own Lightning wallet
// (Wallet of Satoshi) via its Lightning Address. Flow after a payment is
// server-verified:
//
//   ZBD charge completed (1,000 sats into ZBD balance)
//     -> resolve WoS lightning address (LNURL-pay)
//     -> request an exact-amount BOLT11 invoice from WoS
//     -> ZBD pays that invoice from our balance (POST /v0/payments)
//     -> preimage returned = funds in the operator's wallet
//
// Idempotent per order: payout_ref records the ZBD payment id and payout
// status is only set to sent when ZBD returns a completed payment. Failures
// mark the order 'failed' and can be retried via /api/admin/payments/retry
// or the daily cron — a failed payout never blocks license issuance.

import { invoiceForAddress, decodeBolt11AmountMsats } from "./lnurl";
import { sendPayment, PRICE_MSATS } from "./zbd";
import { licensingDb } from "./db";
import { auditEvent } from "../audit";

export function operatorLightningAddress(): string {
  return process.env.TT_WOS_LIGHTNING_ADDRESS?.trim() || "clumsyparsnip913@walletofsatoshi.com";
}

export interface SettleResult {
  ok: boolean;
  status: "sent" | "failed" | "skipped";
  reason?: string;
  ref?: string;
}

/** Settle one paid order to the operator wallet. Safe to call repeatedly. */
export async function settleOrder(orderId: string): Promise<SettleResult> {
  const db = licensingDb();
  const order = await db.getOrder(orderId);
  if (!order) return { ok: false, status: "skipped", reason: `unknown order ${orderId}` };
  if (order.payoutStatus === "sent") {
    return { ok: true, status: "sent", ref: order.payoutRef ?? undefined };
  }

  try {
    // 1. Get an exact-amount invoice from the operator's wallet.
    const inv = await invoiceForAddress(operatorLightningAddress(), Number(PRICE_MSATS), `TT ${orderId}`);
    // 2. Paranoia: the invoice WoS returned must actually be for our amount.
    const decoded = decodeBolt11AmountMsats(inv.pr);
    if (decoded != null && decoded !== Number(PRICE_MSATS)) {
      throw new Error(`invoice amount mismatch: got ${decoded} msats, wanted ${PRICE_MSATS}`);
    }
    // 3. Pay it from the ZBD balance. internalId embeds the order for tracing.
    const payment = await sendPayment({
      invoice: inv.pr,
      amountMsats: PRICE_MSATS,
      internalId: `tt-settle-${orderId}`,
      description: `TruffleTrade settlement ${orderId}`,
    });
    if (payment.status !== "completed") {
      throw new Error(`payout not completed (status ${payment.status})`);
    }
    await db.setOrderPayout(orderId, { status: "sent", ref: payment.id, error: null, ts: Date.now() });
    auditEvent("payout_sent", "system", { orderId, ref: payment.id });
    return { ok: true, status: "sent", ref: payment.id };
  } catch (err) {
    const msg = (err as Error).message ?? "payout failed";
    await db.setOrderPayout(orderId, { status: "failed", error: msg.slice(0, 300), ts: Date.now() });
    auditEvent("payout_failed", "system", { orderId, error: msg.slice(0, 300) });
    return { ok: false, status: "failed", reason: msg };
  }
}

/** Sweep orders that are issued but not yet settled (cron / admin retry). */
export async function settlePendingOrders(limit = 25): Promise<{ attempted: number; sent: number; failed: number }> {
  const db = licensingDb();
  const pending = await db.ordersPendingPayout(limit);
  let sent = 0;
  let failed = 0;
  for (const o of pending) {
    const r = await settleOrder(o.id);
    if (r.status === "sent") sent++;
    else if (r.status === "failed") failed++;
  }
  return { attempted: pending.length, sent, failed };
}
