import { NextResponse } from "next/server";
import { z } from "zod";
import { orderStatus } from "@core/licensing/fulfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ orderId: z.string().regex(/^[0-9a-f]{24}$/) });

/** GET /api/billing/status?orderId=... — lightweight poll for the buy page. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId") ?? "";
  if (!/^[0-9a-f]{24}$/.test(orderId)) {
    return NextResponse.json({ ok: false, error: "invalid orderId" }, { status: 400 });
  }
  try {
    const s = await orderStatus(orderId);
    return NextResponse.json({ ok: true, ...s });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 404 });
  }
}

/** POST — same check, forcing fulfillment verification with ZBD. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid orderId" }, { status: 400 });
  }
  try {
    const s = await orderStatus(parsed.data.orderId);
    return NextResponse.json({ ok: true, ...s });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 404 });
  }
}
