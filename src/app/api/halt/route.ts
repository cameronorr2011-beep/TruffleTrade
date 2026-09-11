import { NextResponse } from "next/server";
import { assertConfig } from "@core/config";
import { haltDesk } from "@core/engine-core";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    assertConfig();
    const result = await haltDesk();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
