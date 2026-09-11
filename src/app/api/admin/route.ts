import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAccessCode, generateAccessCode, hashCode } from "@core/licensing/codes";
import { licensingDb } from "@core/licensing/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminAuthorized(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) return false; // admin endpoints disabled unless ADMIN_TOKEN is set
  const header = req.headers.get("x-admin-token") ?? "";
  return header === token;
}

const ExtendSchema = z.object({
  code: z.string().min(8).max(40),
  days: z.number().int().min(1).max(365),
});

/**
 * POST /api/admin — operator-only management.
 * Actions: extend (renew a code), revoke, issue (comp a code), stats.
 * Requires x-admin-token matching ADMIN_TOKEN. Never enabled by accident.
 */
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
  const parsed = z
    .object({ action: z.enum(["extend", "revoke", "issue", "stats"]), code: z.string().optional(), days: z.number().optional() })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid action" }, { status: 400 });
  }

  const db = licensingDb();
  const { action } = parsed.data;

  if (action === "stats") {
    const active = await db.activeCodeCount();
    return NextResponse.json({ ok: true, activeCodes: active });
  }

  if (action === "issue") {
    const code = generateAccessCode();
    const hash = hashCode(code);
    const now = Date.now();
    await db.createCode({ codeHash: hash, orderId: "comped", activatedTs: now, expiresTs: now + 30 * 86_400_000 });
    return NextResponse.json({ ok: true, code }); // shown once
  }

  const rawCode = parsed.data.code ?? "";
  const code = verifyAccessCode(rawCode);
  if (!code) {
    return NextResponse.json({ ok: false, error: "invalid code format" }, { status: 400 });
  }
  const hash = hashCode(code);
  const row = await db.getCode(hash);
  if (!row) {
    return NextResponse.json({ ok: false, error: "unknown code" }, { status: 404 });
  }

  if (action === "extend") {
    const days = parsed.data.days ?? 30;
    const base = Math.max(row.expiresTs, Date.now());
    await db.setCodeExpiry(hash, base + days * 86_400_000);
    await db.setCodeStatus(hash, "active");
    const updated = await db.getCode(hash);
    return NextResponse.json({ ok: true, expiresTs: updated?.expiresTs });
  }

  // revoke
  await db.setCodeStatus(hash, "revoked");
  return NextResponse.json({ ok: true, revoked: true });
}
