import { NextResponse } from "next/server";
import z from "zod";
import { licensingDb } from "@core/licensing/db";
import { generateAccessCode, hashCode } from "@core/licensing/codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminAuthorized(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) return false;
  return (req.headers.get("x-admin-token") ?? "") === token;
}

const OrderSchema = z.object({
  orderId: z.string().regex(/^[0-9a-f]{24}$/),
  action: z.enum(["approve"]),
});

/**
 * POST /api/admin/orders — manual fulfillment for the Wallet-of-Satoshi flow.
 * The operator confirms the 1,000-sat deposit arrived in their WoS wallet,
 * then approves the order; the buyer's access code is issued immediately.
 * GET — recent orders so the operator can see what's waiting.
 */
export async function GET(req: Request) {
  if (!adminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const orders = await licensingDb().recentOrders(50);
  return NextResponse.json({
    ok: true,
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      createdTs: o.createdTs,
      paidTs: o.paidTs,
      hasCode: Boolean(o.codeHash),
    })),
  });
}

export async function POST(req: Request) {
  if (!adminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const parsed = OrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }
  const { orderId } = parsed.data;
  const db = licensingDb();
  const order = await db.getOrder(orderId);
  if (!order) {
    return NextResponse.json({ ok: false, error: "unknown order" }, { status: 404 });
  }
  if (order.status === "issued") {
    // Idempotent: return the same code (it is stored on the order row).
    const code = await db.getOrderPlainCode(orderId);
    return NextResponse.json({ ok: true, status: "issued", accessCode: code ?? undefined });
  }

  const code = generateAccessCode();
  const hash = hashCode(code);
  const now = Date.now();
  await db.createCode({ codeHash: hash, orderId, activatedTs: now, expiresTs: now + 30 * 86_400_000 });
  await db.setOrderIssuedPlain(orderId, hash, code);
  return NextResponse.json({ ok: true, status: "issued", accessCode: code });
}
