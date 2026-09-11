import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/guard";
import { placePaperOrder } from "@core/paper/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    ticker: z.string().min(1).max(10),
    side: z.enum(["buy", "sell"]),
    quantity: z.number().positive().finite().max(1e6),
    type: z.enum(["market", "limit"]).optional(),
    limitPrice: z.number().positive().finite().max(1e7).optional(),
  })
  .strict();

/**
 * POST /api/paper/order — place a SIMULATED order.
 * Pipeline (spec §19/§20): validate → live mark price (fail closed on stale/
 * unavailable data) → risk engine → paper engine fill → persist → audit.
 * Requires a valid subscription (guard); bodies are bounded and validated.
 */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid order: ticker, side ('buy'|'sell'), positive quantity required; limit orders need limitPrice", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  const accessCode = req.headers.get("x-access-code") ?? process.env.TT_ACCESS_CODE ?? "";
  if (!accessCode.trim()) {
    return NextResponse.json({ ok: false, error: "access code required", code: "SUBSCRIPTION_REQUIRED" }, { status: 401 });
  }

  try {
    const receipt = await placePaperOrder({ accessCode, ...parsed.data });
    if (!receipt.ok) {
      return NextResponse.json({ ok: false, error: receipt.error, code: receipt.code }, { status: receipt.status });
    }
    return NextResponse.json({ ...receipt, ok: true, simulated: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "order failed";
    if (process.env.NODE_ENV !== "production") console.error("[paper] order error:", msg);
    return NextResponse.json(
      { ok: false, error: "order processing failed — state unchanged", code: "ORDER_BACKEND_ERROR" },
      { status: 503 },
    );
  }
}
