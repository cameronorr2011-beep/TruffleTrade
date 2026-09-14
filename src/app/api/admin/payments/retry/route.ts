import { NextResponse } from "next/server";
import { settleOrder, settlePendingOrders } from "@core/licensing/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminAuthorized(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) return false; // admin endpoints disabled unless ADMIN_TOKEN is set
  const header = req.headers.get("x-admin-token") ?? "";
  return header === token;
}

/**
 * POST /api/admin/payments/retry — operator-only settlement retry.
 *   { }            -> sweep all issued-but-unsettled orders (default limit 25)
 *   { orderId }    -> settle one specific order
 * Also safe for the Vercel cron (honor x-cron header, no secret needed there
 * but the sweep itself is read->settle on paid orders only).
 */
export async function POST(req: Request) {
  const isCron = req.headers.get("x-vercel-cron") !== null;
  if (!isCron && !adminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let orderId: string | null = null;
  try {
    const body = (await req.json()) as { orderId?: string };
    if (body && typeof body.orderId === "string" && /^[0-9a-f]{24}$/.test(body.orderId)) {
      orderId = body.orderId;
    }
  } catch {
    // empty body -> sweep
  }

  try {
    if (orderId) {
      const r = await settleOrder(orderId);
      return NextResponse.json({ ok: r.ok, result: r });
    }
    const sweep = await settlePendingOrders(25);
    return NextResponse.json({ ok: true, sweep });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  // Same entrypoint for cron (Vercel cron issues GET requests).
  return POST(req);
}
