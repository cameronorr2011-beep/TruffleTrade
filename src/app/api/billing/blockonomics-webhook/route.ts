import { NextResponse } from "next/server";
import { licensingDb } from "@core/licensing/db";
import { verifyCallbackSecret, isTestModeCharge } from "@core/licensing/blockonomics";

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
 * Test Mode exception: dashboard-simulated payments use fake
 * `1TestBTCAddress…` addresses whose balance the /api/balance API rejects,
 * so there is nothing to re-poll and no real funds to verify. A status=2
 * callback (fully confirmed per Blockonomics' own simulation) fulfills the
 * test order directly. Production addresses are unaffected.
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

  const status = Number(url.searchParams.get("status") ?? "");

  const db = licensingDb();
  const order = await db.getOrderByCharge(`bnc-btc-${addr}`);
  if (!order) {
    // Unknown address: acknowledge so Blockonomics doesn't retry forever.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Test Mode: fulfill on the simulated fully-confirmed callback (status=2).
  // Statuses 0/1 are progress ticks — acknowledge and wait for the final one.
  if (isTestModeCharge(order.chargeId)) {
    if (status !== 2) return NextResponse.json({ ok: true, status, testMode: true, ignored: true });
    try {
      const { fulfillTestModeOrder } = await import("@core/licensing/fulfill");
      const result = await fulfillTestModeOrder(order.id);
      return NextResponse.json({ ok: true, testMode: true, ...result });
    } catch (err) {
      // 500 makes Blockonomics retry (7× backoff); next attempt is idempotent.
      console.error("[blockonomics-webhook] test-mode fulfillment error:", (err as Error).message);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
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
