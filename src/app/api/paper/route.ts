import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { hashCode } from "@core/licensing/codes";
import { paperPortfolio } from "@core/paper/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/paper — portfolio snapshot for the caller's access code.
 * The code is accepted from the x-access-code header or the server-side
 * TT_ACCESS_CODE (local subscriber install). Never from a query parameter.
 * Cross-user isolation: every store query is scoped to the caller's code hash.
 */
export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;

  const accessCode = req.headers.get("x-access-code") ?? process.env.TT_ACCESS_CODE ?? "";
  if (!accessCode.trim()) {
    return NextResponse.json({ ok: false, error: "access code required", code: "SUBSCRIPTION_REQUIRED" }, { status: 401 });
  }
  try {
    const portfolio = await paperPortfolio(accessCode);
    return NextResponse.json({ ok: true, ...portfolio });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "portfolio load failed";
    if (process.env.NODE_ENV !== "production") console.error("[paper] portfolio error:", msg);
    return NextResponse.json(
      { ok: false, error: "portfolio temporarily unavailable — check database connectivity", code: "PAPER_BACKEND_ERROR" },
      { status: 503 },
    );
  }
}

/** Exposed for tests: the hash scoping used for isolation. */
export function ownerHashOf(code: string): string {
  return hashCode(code);
}
