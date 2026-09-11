import { NextResponse } from "next/server";

import { validateAccessCode, checkRateLimit } from "@core/licensing/validate";

/**
 * Gate for endpoints that burn paid AI (research runs, cycles, halt).
 *
 * Two modes:
 *  1. DASHBOARD_TOKEN set   → operator mode: requests must carry x-desk-token.
 *  2. Otherwise (default)   → subscription mode: requests must present a valid,
 *     unexpired access code via x-access-code. A server-side TT_ACCESS_CODE
 *     (e.g. a local subscriber's .env) is accepted so the local app works
 *     without headers.
 *
 * This closes the free-ride hole: the public deployment must never let
 * anonymous visitors trigger Groq calls. Live market DATA (keyless Yahoo)
 * stays free by design — only intelligence is metered.
 */
export async function guard(req: Request): Promise<NextResponse | null> {
  const operatorToken = process.env.DASHBOARD_TOKEN?.trim();
  if (operatorToken) {
    if (req.headers.get("x-desk-token") !== operatorToken) {
      return NextResponse.json({ ok: false, error: "invalid or missing x-desk-token" }, { status: 401 });
    }
    return null;
  }

  // Subscription mode. Anonymous callers are rejected here.
  const presented = req.headers.get("x-access-code") ?? process.env.TT_ACCESS_CODE ?? "";
  const validation = await validateAccessCode(presented);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error ?? "subscription required", code: "SUBSCRIPTION_REQUIRED" },
      { status: validation.status },
    );
  }
  const rl = checkRateLimit(validation.codeHash!);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate limit exceeded — retry shortly", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(Math.ceil(rl.resetMs / 1000)) } },
    );
  }
  return null;
}
