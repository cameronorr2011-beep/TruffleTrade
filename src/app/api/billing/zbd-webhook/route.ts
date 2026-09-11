import { NextResponse } from "next/server";
import { z } from "zod";
import { licensingDb } from "@core/licensing/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/zbd-webhook — ZBD POSTs charge updates here.
 * The payload is NOT trusted: we only use it as a hint, then verify
 * server-to-server by polling ZBD for the charge status (see zbd.ts).
 * IP allowlisting of ZBD source IPs is applied as a first filter.
 */

// ZBD Payments API egress ranges (per ZBD docs "Security / Integrity").
// Checked as a soft filter; the authoritative check is the server-to-server poll.
const ZBD_IP_PREFIXES = ["34.", "35.", "104.18.", "172.64."];

function plausiblyFromZbd(req: Request): boolean {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0].trim();
  if (!ip) return true; // behind proxies that strip it — rely on the poll check
  return ZBD_IP_PREFIXES.some((p) => ip.startsWith(p));
}

const BodySchema = z.object({
  id: z.string().min(4).max(80),
  status: z.string().max(20).optional(),
  internalId: z.string().max(80).nullable().optional(),
});

export async function POST(req: Request) {
  if (!plausiblyFromZbd(req)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }

  const { verifyAndFulfillOrder } = await import("@core/licensing/fulfill");
  try {
    const result = await verifyAndFulfillOrder(parsed.data.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Never leak internals to the caller; ZBD retries on 5xx.
    console.error("[zbd-webhook] fulfillment error:", (err as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
