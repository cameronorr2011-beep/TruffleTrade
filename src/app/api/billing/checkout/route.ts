import { NextResponse } from "next/server";
import { z } from "zod";
import { newOrderId } from "@core/licensing/codes";
import { PRICE_SATS, createCharge } from "@core/licensing/zbd";
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

  // Manual mode: no ZBD_API_KEY configured (or TT_PAYMENT_MODE=manual).
  // The buyer sends 1,000 sats to the operator's Lightning address from any
  // wallet; the operator approves the order via /api/admin/orders and the
  // access code appears on the buyer's screen. This keeps the site sellable
  // while ZBD business onboarding (KYB) is pending.
  const manualMode = !process.env.ZBD_API_KEY?.trim() || process.env.TT_PAYMENT_MODE === "manual";
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
