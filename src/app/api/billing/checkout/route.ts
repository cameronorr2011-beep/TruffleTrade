import { NextResponse } from "next/server";
import { z } from "zod";
import { newOrderId } from "@core/licensing/codes";
import { PRICE_SATS, createCharge } from "@core/licensing/zbd";
import { blinkEnabled, createInvoice } from "@core/licensing/blink";
import { blockonomicsEnabled, createBlockonomicsAddress, chargeIdForAddress, BTC_AMOUNT } from "@core/licensing/blockonomics";
import { licensingDb } from "@core/licensing/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  callbackUrl: z.string().url().optional(), // override for local testing (ngrok)
});

/**
 * POST /api/billing/checkout — create a 1000-sat Lightning charge for 30 days
 * of TruffleTrade access. Returns the invoice for QR / wallet payment.
 */
export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: `invalid body: ${parsed.error.issues[0]?.message}` }, { status: 400 });
  }

  const orderId = newOrderId();

  // Blink mode (default when BLINK_API_KEY is set): a real 1,000-sat BOLT11
  // invoice is created on the operator's OWN Blink wallet — sats land directly
  // in the operator's balance, no middleman account, no payout step. Free
  // self-serve account (no KYB); key needs only Read+Receive scopes.
  // TT_PAYMENT_MODE=manual forces the manual Wallet-of-Satoshi flow;
  // TT_PAYMENT_MODE=zbd forces the legacy ZBD charge flow.
  let blinkAttempted = false;
  if (blinkEnabled()) {
    blinkAttempted = true;
    try {
      const inv = await createInvoice({ orderId });
      await licensingDb().createOrder(orderId, inv.paymentHash, Date.now());
      return NextResponse.json({
        ok: true,
        orderId,
        provider: "blink",
        priceSats: PRICE_SATS,
        invoice: inv.paymentRequest,
        lightningUri: `lightning:${inv.paymentRequest}`,
        // Blink BTC invoices expire in hours; the UI re-creates checkout if
        // the buyer waits too long — no extra expiry wiring needed.
      });
    } catch (err) {
      // Fall back to manual rather than losing the sale if Blink hiccups.
      console.error("[checkout] blink invoice failed, falling back to manual:", (err as Error).message);
    }
  }

  // Blockonomics mode (when BLOCKONOMICS_API_KEY is set): on-chain BTC paid
  // straight to the operator's own wallet (xpub-derived unique address per
  // order — Blockonomics never custodies funds). The buyer sends exactly
  // 1,000 sats (0.00001 BTC); fulfillment happens at 2 confirmations via the
  // callback webhook plus buy-page polling of the confirmed balance.
  let bncAttempted = false;
  if (blockonomicsEnabled()) {
    bncAttempted = true;
    const siteUrl = process.env.TT_SITE_URL?.trim() || new URL(req.url).origin;
    try {
      const { address } = await createBlockonomicsAddress(siteUrl);
      await licensingDb().createOrder(orderId, chargeIdForAddress(address), Date.now());
      return NextResponse.json({
        ok: true,
        orderId,
        provider: "blockonomics",
        priceSats: PRICE_SATS,
        btcAmount: BTC_AMOUNT,
        address,
        // BIP21 URI — wallet apps pre-fill address + amount when scanned.
        bitcoinUri: `bitcoin:${address}?amount=${BTC_AMOUNT}&label=${encodeURIComponent(`TruffleTrade ${orderId}`)}`,
      });
    } catch (err) {
      // Fall back to manual rather than losing the sale if the API hiccups.
      console.error("[checkout] blockonomics address failed, falling back to manual:", (err as Error).message);
    }
  }

  // Manual mode: no BLOCKONOMICS_API_KEY/BLINK_API_KEY configured (or
  // TT_PAYMENT_MODE=manual). The buyer sends 1,000 sats to the operator's
  // Lightning address from any wallet; the operator approves the order via
  // /api/admin/orders and the access code appears on the buyer's screen.
  // If Blink or Blockonomics was enabled but its invoice/address creation
  // just failed, fall back to manual rather than attempting ZBD (which
  // likely has no key either).
  const manualMode = blinkAttempted || bncAttempted || !process.env.ZBD_API_KEY?.trim() || process.env.TT_PAYMENT_MODE === "manual";
  if (manualMode) {
    await licensingDb().createOrder(orderId, `wos-manual-${orderId}`, Date.now());
    return NextResponse.json({
      ok: true,
      manual: true,
      orderId,
      priceSats: PRICE_SATS,
      lightningAddress: process.env.TT_WOS_LIGHTNING_ADDRESS?.trim() || "clumsyparsnip913@walletofsatoshi.com",
    });
  }

  const origin = parsed.data.callbackUrl ? undefined : new URL(req.url).origin;
  const callbackUrl =
    parsed.data.callbackUrl ??
    (origin ? `${process.env.TT_SITE_URL?.replace(/\/$/, "") || origin}/api/billing/zbd-webhook` : undefined);

  if (!callbackUrl) {
    return NextResponse.json({ ok: false, error: "cannot determine webhook callback URL — set TT_SITE_URL" }, { status: 500 });
  }

  try {
    const charge = await createCharge({ orderId, callbackUrl });
    await licensingDb().createOrder(orderId, charge.id, Date.now());
    return NextResponse.json({
      ok: true,
      orderId,
      chargeId: charge.id,
      priceSats: PRICE_SATS,
      invoice: charge.invoice?.request ?? null,
      lightningUri: charge.invoice?.uri ?? null,
      expiresAt: charge.expiresAt,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
