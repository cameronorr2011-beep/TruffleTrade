import { NextResponse } from "next/server";
import { z } from "zod";
import { licensingDb } from "@core/licensing/db";
import { chargeIdIsBlink, verifyAndFulfillOrder } from "@core/licensing/fulfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/blink-webhook — Blink (via Svix) POSTs `receive.lightning`
 * events here. Configured in the Blink Dashboard → Callback Endpoints.
 *
 * The payload is NOT trusted: it is only a hint that speeds up fulfillment.
 * The authoritative check is always verifyAndFulfillOrder → server-to-server
 * Blink poll of the invoice status by payment hash. A forged webhook can at
 * most trigger a verification that returns "not paid" — it can never issue a
 * code for an unpaid order. The paymentHash must also already exist as a
 * pending Blink order in our database, or the event is ignored.
 */

const BodySchema = z.object({
  eventType: z.string().max(40).optional(),
  transaction: z
    .object({
      status: z.string().max(20).optional(),
      settlementAmount: z.number().int().optional(),
      settlementCurrency: z.string().max(8).optional(),
      initiationVia: z
        .object({
          type: z.string().max(20).optional(),
          paymentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    // Unknown shape — acknowledge so Svix stops retrying; we poll independently.
    return NextResponse.json({ ok: true, ignored: "unrecognized payload" });
  }

  const paymentHash = parsed.data.transaction?.initiationVia?.paymentHash;
  if (!paymentHash || parsed.data.eventType !== "receive.lightning") {
    return NextResponse.json({ ok: true, ignored: "not a lightning receive" });
  }

  const order = await licensingDb().getOrderByCharge(paymentHash);
  if (!order || !chargeIdIsBlink(order.chargeId)) {
    // Not one of ours (or a ZBD charge id collision, which cannot happen —
    // ZBD ids are not 64-char hex). Acknowledge and drop.
    return NextResponse.json({ ok: true, ignored: "unknown payment hash" });
  }

  try {
    const result = await verifyAndFulfillOrder(order.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // 5xx so Svix retries with backoff; the poll path fulfills regardless.
    console.error("[blink-webhook] fulfillment error:", (err as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
