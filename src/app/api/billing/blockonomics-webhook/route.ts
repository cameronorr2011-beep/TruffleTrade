import { NextResponse } from "next/server";
import { licensingDb } from "@core/licensing/db";
import { verifyCallbackSecret } from "@core/licensing/blockonomics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/billing/blockonomics-webhook?secret=...&addr=...&status=...&value=...&txid=...
 *
 * Blockonomics GETs this URL when a payment to a generated address reaches
 * confirmations (status >= 2). The ?secret query parameter is the only auth on
 * the callback — verify it in constant time. Even so, the payload is NOT
 * trusted for fulfillment: we only use it as a hint to locate the order, then
 * the authoritative check polls Blockonomics' /api/balance for the address
 * (server-to-server, same trust model as the ZBD/Blink integrations).
 *
 * Dashboard setup: Store → Callback URL =
 *   https://<your-site>/api/billing/blockonomics-webhook?secret=<BLOCKONOMICS_CALLBACK_SECRET>
 * (or append ?secret=<BLOCKONOMICS_API_KEY> if no dedicated secret is set).
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!verifyCallbackSecret(url.searchParams.get("secret"))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const addr = url.searchParams.get("addr") ?? "";
  if (!/^[a-zA-Z0-9]{20,80}$/.test(addr)) {
    return NextResponse.json({ ok: false, error: "invalid addr" }, { status: 400 });
  }

  const db = licensingDb();
  const order = await db.getOrderByCharge(`bnc-btc-${addr}`);
  if (!order) {
    // Unknown address: acknowledge so Blockonomics doesn't retry forever.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { verifyAndFulfillOrder } = await import("@core/licensing/fulfill");
  try {
    const result = await verifyAndFulfillOrder(order.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Never leak internals; Blockonomics retries non-2xx callbacks.
    console.error("[blockonomics-webhook] fulfillment error:", (err as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
