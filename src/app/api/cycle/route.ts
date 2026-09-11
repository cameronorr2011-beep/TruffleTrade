import { NextResponse } from "next/server";
import { assertConfig } from "@core/config";
import { cycleOnce, makeBroker } from "@core/engine-core";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

let running = false;

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  if (running) {
    return NextResponse.json({ ok: false, error: "a cycle is already running" }, { status: 409 });
  }
  running = true;
  try {
    assertConfig();
    const result = await cycleOnce(makeBroker());
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  } finally {
    running = false;
  }
}
