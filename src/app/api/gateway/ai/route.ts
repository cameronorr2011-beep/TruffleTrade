import { NextResponse } from "next/server";
import { z } from "zod";
import { validateWithAbuseTracking, checkRateLimit } from "@core/licensing/validate";
import { isLockedOut } from "@core/licensing/abuse";
import { clientIp } from "@/lib/client-ip";
import { makeProvider } from "@core/research/ai";
import type { ChatMessage } from "@core/research/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        // "assistant" allowed so conversational clients can send prior turns.
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1).max(24_000),
      }),
    )
    .min(1)
    .max(24),
  model: z.string().max(80).optional(),
  maxTokens: z.number().int().min(64).max(8_000).optional(),
  promptVersion: z.string().max(40).optional(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  temperature: z.number().min(0).max(1).optional(),
});

/**
 * POST /api/gateway/ai — the ONLY path to the Groq credential.
 * Subscribers authenticate with their access code; the server validates the
 * subscription, rate-limits, and forwards to Groq. The key never leaves here.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (await isLockedOut(ip)) {
    return NextResponse.json(
      { ok: false, error: "too many failed attempts — access denied temporarily" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(15 * 60)) } },
    );
  }
  const codeHeader = req.headers.get("x-access-code") ?? "";
  const validation = await validateWithAbuseTracking(codeHeader, ip);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: validation.status });
  }
  const rl = checkRateLimit(validation.codeHash!);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: `rate limit exceeded — retry in ${Math.ceil(rl.resetMs / 1000)}s` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: `invalid body: ${parsed.error.issues[0]?.message}` }, { status: 400 });
  }

  const { messages, model, maxTokens, promptVersion, reasoningEffort, temperature } = parsed.data;
  const provider = makeProvider(); // operator path — reads GROQ_API_KEY server-side only
  if (model && provider.model !== model) {
    // Only the operator decides the model; silently honor the default if a
    // client requests something else (prevents abuse via expensive models).
    void model;
  }

  try {
    const result = await provider.chatJson<unknown>(messages as ChatMessage[], promptVersion ?? "gateway-v1", maxTokens ?? 2200, {
      reasoningEffort,
      temperature,
    });
    // Record usage against the code.
    const { licensingDb } = await import("@core/licensing/db");
    await licensingDb().touchCode(validation.codeHash!, Date.now());
    return NextResponse.json({
      ok: true,
      data: result.data,
      meta: {
        model: result.meta.model,
        tokensIn: result.meta.tokensIn,
        tokensOut: result.meta.tokensOut,
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
