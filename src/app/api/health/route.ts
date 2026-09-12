import { NextResponse } from "next/server";
import { validateAccessCode } from "@core/licensing/validate";
import { dbKind } from "@core/licensing/db";
import { auditStore } from "@core/audit";
import { usageStats } from "@core/research/router";
import { pluginCatalog } from "@core/data/plugins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STARTED = Date.now();

/**
 * GET /api/health — internal diagnostics (spec §30).
 * Authorized callers only: x-admin-token must match ADMIN_TOKEN, or a valid
 * access code must be presented (x-access-code / server-side TT_ACCESS_CODE).
 * Reports component status without leaking secrets or connection strings.
 */
export async function GET(req: Request) {
  const adminToken = process.env.ADMIN_TOKEN?.trim();
  const isAdmin = Boolean(adminToken) && (req.headers.get("x-admin-token") ?? "") === adminToken;
  if (!isAdmin) {
    const accessCode = req.headers.get("x-access-code") ?? process.env.TT_ACCESS_CODE ?? "";
    const v = await validateAccessCode(accessCode);
    if (!v.ok) {
      return NextResponse.json({ ok: false, error: "unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }
  }

  const store = auditStore();
  let dbOk = false;
  let dbDetail = "unknown";
  try {
    await Promise.race([
      store.recentAudit(1),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout after 4s")), 4000)),
    ]);
    dbOk = true;
    dbDetail = `reachable (${dbKind()})`;
  } catch (e) {
    dbDetail = e instanceof Error ? e.message : "unreachable";
  }

  const zbd = Boolean(process.env.ZBD_API_KEY?.trim());
  const groq = Boolean(process.env.GROQ_API_KEY?.trim());
  const admin = Boolean(adminToken);

  return NextResponse.json({
    ok: dbOk,
    app: {
      version: process.env.npm_package_version ?? "1.0.0",
      uptimeSec: Math.floor((Date.now() - STARTED) / 1000),
    },
    database: { status: dbOk ? "ok" : "error", detail: dbDetail },
    dataPlugins: pluginCatalog(),
    aiProvider: { configured: groq, gatewayMode: groq ? "server-side" : "unconfigured", usage: usageStats() },
    payments: { configured: zbd, fallback: zbd ? "zbd charges" : "manual wallet-of-satoshi approval" },
    adminApi: { configured: admin },
    featureFlags: {
      AI_MODEL_ROUTER: true,
      FEDERATED_SYNC: true,
      DIGITAL_TWIN: true,
    },
  });
}
