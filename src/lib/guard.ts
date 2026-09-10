import { NextResponse } from "next/server";

/**
 * Mutating endpoints accept an optional DASHBOARD_TOKEN: if the env var is set,
 * requests must carry `x-desk-token` matching it. Keeps a public deployment
 * from letting strangers run cycles.
 */
export function guard(req: Request): NextResponse | null {
  const token = process.env.DASHBOARD_TOKEN?.trim();
  if (!token) return null;
  if (req.headers.get("x-desk-token") !== token) {
    return NextResponse.json({ ok: false, error: "invalid or missing x-desk-token" }, { status: 401 });
  }
  return null;
}
