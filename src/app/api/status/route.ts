import { NextResponse } from "next/server";
import { deskSnapshot } from "@/lib/desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snap = await deskSnapshot();
    return NextResponse.json({ ok: true, snapshot: snap });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
