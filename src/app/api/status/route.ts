import { NextResponse } from "next/server";
import { dbKind } from "@core/licensing/db";
import { getDb } from "@core/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STARTED = Date.now();

/**
 * GET /api/status — lightweight liveness probe for the desktop shell.
 * Neutral product status only: the app is up, its local DB opens, memory is on.
 */
export async function GET() {
  let localDb = "error";
  try {
    getDb().prepare("SELECT 1").get();
    localDb = "ok";
  } catch {
    // reported below
  }

  return NextResponse.json({
    ok: true,
    app: { version: process.env.npm_package_version ?? "1.0.0", uptimeSec: Math.floor((Date.now() - STARTED) / 1000) },
    localDb,
    licensingBackend: dbKind(),
    memory: { enabled: true, autoUpdateHours: 6 },
  });
}
