import { NextResponse } from "next/server";
import { validateAccessCode } from "@core/licensing/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/gateway/verify — the local app pings this at startup with its access code. */
export async function GET(req: Request) {
  const code = req.headers.get("x-access-code") ?? "";
  const v = await validateAccessCode(code);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: v.status });
  }
  return NextResponse.json({
    ok: true,
    product: "TruffleTrade",
    expiresTs: v.expiresTs,
    daysRemaining: v.expiresTs ? Math.max(0, Math.ceil((v.expiresTs - Date.now()) / 86_400_000)) : 0,
  });
}
