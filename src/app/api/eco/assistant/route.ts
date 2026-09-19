import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, callerId } from "@/lib/guard";
import { BlackTruffle } from "@core/eco/blacktruffle";
import type { BlackTruffleTurn } from "@core/eco/blacktruffle";
import { makeProvider } from "@core/research/ai";
import { ecoDb } from "@core/eco/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BODY = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
  /** Where the user is in the app, so the panel can be contextual. */
  context: z.string().max(300).optional(),
});

/**
 * POST /api/eco/assistant — Black Truffle (personal assistant & orchestrator).
 * Gated like every AI-burning endpoint. The agent runs server-side with
 * retrieval-scoped tools; the client only sends the conversation turns.
 */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const body = BODY.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "invalid conversation" }, { status: 400 });
  }

  let provider;
  try {
    provider = makeProvider();
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }

  try {
    const agent = new BlackTruffle(callerId(req), provider, ecoDb());
    const turns: BlackTruffleTurn[] = body.data.messages.map((m) => ({ role: m.role, content: m.content }));
    if (body.data.context) {
      const last = turns[turns.length - 1];
      if (last?.role === "user") last.content = `[Context: user is viewing ${body.data.context}]\n\n${last.content}`;
    }
    const result = await agent.respond(turns);
    return NextResponse.json({ ok: true, reply: result.reply, toolsUsed: result.toolsUsed, memoryUsed: result.memoryUsed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Black Truffle failed: ${(e as Error).message}` }, { status: 502 });
  }
}
