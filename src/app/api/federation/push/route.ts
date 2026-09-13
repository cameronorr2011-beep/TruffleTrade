import { NextResponse } from "next/server";
import { z } from "zod";
import { validateWithAbuseTracking, checkRateLimit } from "@core/licensing/validate";
import { isLockedOut } from "@core/licensing/abuse";
import { clientIp } from "@/lib/client-ip";
import { licensingDb } from "@core/licensing/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  epoch: z.number().int().min(0).max(1_000_000_000),
  tokens: z.number().int().min(0).max(100_000),
  batches: z
    .array(
      z.object({
        subjectHash: z.string().regex(/^[0-9a-f]{16}$/),
        kindCounts: z.record(z.string(), z.number().int().min(0).max(10_000)),
      }),
    )
    .max(500),
});

/** POST /api/federation/push — submit a privacy-preserving memory update batch. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (await isLockedOut(ip)) {
    return NextResponse.json(
      { ok: false, error: "too many failed attempts — access denied temporarily" },
      { status: 429, headers: { "retry-after": String(Math.ceil(15 * 60)) } },
    );
  }
  const codeHeader = req.headers.get("x-access-code") ?? "";
  const validation = await validateWithAbuseTracking(codeHeader, ip);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: validation.status });
  }
  const rl = checkRateLimit(validation.codeHash!);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: `invalid payload: ${parsed.error.issues[0]?.message}` }, { status: 400 });
  }

  const { epoch, tokens, batches } = parsed.data;
  // peerHash: derive pseudonymous peer identity from the code hash (never the code itself).
  const peer = validation.codeHash!.slice(0, 16);
  await licensingDb().saveFederationUpdate(Date.now(), peer, tokens, epoch, JSON.stringify(batches));
  return NextResponse.json({ ok: true, epoch });
}
