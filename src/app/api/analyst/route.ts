import { NextResponse } from "next/server";
import { z } from "zod";
import { validateWithAbuseTracking, checkRateLimit } from "@core/licensing/validate";
import { isLockedOut } from "@core/licensing/abuse";
import { clientIp } from "@/lib/client-ip";
import { makeProvider } from "@core/research/ai";
import type { ChatMessage } from "@core/research/ai";
import { buildDataPack } from "@core/research/datapack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(6_000),
      }),
    )
    .min(1)
    .max(12),
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9.^=\-]{1,12}$/)
    .optional()
    .or(z.literal("")),
});

/**
 * POST /api/analyst — the conversational research analyst (premium AI).
 * Market context (live quote, technicals, valuation, news) for the viewed
 * ticker is assembled server-side and injected into the system prompt — the
 * model grounds answers in real data instead of guessing. Gated + rate-limited
 * like every AI-burning route; abuse lockout applies.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (await isLockedOut(ip)) {
    return NextResponse.json(
      { ok: false, error: "too many failed attempts — access denied temporarily", code: "LOCKED_OUT" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(15 * 60)) } },
    );
  }
  const codeHeader = req.headers.get("x-access-code") ?? "";
  const validation = await validateWithAbuseTracking(codeHeader, ip);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error, code: "SUBSCRIPTION_REQUIRED" }, { status: validation.status });
  }
  const rl = checkRateLimit(validation.codeHash!);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: `rate limit exceeded — retry in ${Math.ceil(rl.resetMs / 1000)}s`, code: "RATE_LIMITED" },
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

  const { messages, ticker } = parsed.data;

  // Assemble market context server-side (never trust client-supplied context).
  let context = "";
  let contextError: string | null = null;
  if (ticker) {
    try {
      const pack = await buildDataPack(ticker);
      const q = pack.quote;
      const t = pack.technicals;
      const f = pack.fundamentals;
      const news = pack.news.slice(0, 5).map((n) => `- (${n.source}, ${n.publishedTs ? new Date(n.publishedTs).toISOString().slice(0, 10) : "date n/a"}) ${n.title}`);
      context = [
        `TICKER: ${ticker}${q.name ? ` (${q.name})` : ""} — live market context, retrieved ${new Date().toISOString()}`,
        `Price: ${q.price ?? "n/a"} ${q.currency ?? "USD"} | day change: ${q.changePct != null ? q.changePct.toFixed(2) + "%" : "n/a"} | prev close: ${q.prevClose ?? "n/a"}`,
        t.rsi14 != null ? `RSI-14: ${t.rsi14.toFixed(1)} | trend regime: ${t.trendRegime ?? "n/a"} | 30d relative strength vs SPY: ${t.relStrengthVsSpy30d != null ? t.relStrengthVsSpy30d.toFixed(1) + "%" : "n/a"}` : "Technicals: n/a",
        f?.peTtm != null ? `P/E (TTM): ${f.peTtm.toFixed(1)} | gross margin: ${f.grossMarginPct?.toFixed(1) ?? "n/a"}% | revenue growth YoY: ${f.revenueGrowthYoYPct?.toFixed(1) ?? "n/a"}%` : "Fundamentals: n/a",
        news.length ? `Recent headlines:\n${news.join("\n")}` : "No recent headlines.",
      ]
        .filter(Boolean)
        .join("\n");
    } catch (e) {
      contextError = (e as Error).message;
    }
  }

  const system = [
    "You are TruffleTrade AI — a disciplined equity research analyst inside a professional research terminal.",
    "You are NOT a chatbot, NOT a salesperson, and NOT a trading signal service. You produce structured, evidence-first analysis.",
    "RULES:",
    "1. Ground every claim in the MARKET CONTEXT block when present. If context is missing or thin, say so plainly.",
    "2. Label claims: FACT (from context), INFERENCE (your reasoning), SCENARIO (conditional), UNCERTAINTY (unknown).",
    "3. Never guarantee outcomes. Use base case / probability / confidence language.",
    "4. Be concise: 120-220 words unless the user asks for depth. Prefer bullets over prose.",
    "5. End with a one-line 'What would change this view:' invalidator.",
    "6. This is research, not investment advice.",
    "7. Output STRICT JSON: {\"reply\": \"<your full markdown answer>\"} — nothing else at the top level. Use \\n for newlines inside the reply.",
    context ? `\nMARKET CONTEXT (server-verified):\n${context}` : "",
    contextError ? `\nNOTE: live context unavailable (${contextError}) — reason from general knowledge and say so.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const provider = makeProvider(); // operator path — GROQ_API_KEY stays server-side
  try {
    const result = await provider.chatJson<{ reply?: string; answer?: string }>(
      [{ role: "system", content: system }, ...(messages as ChatMessage[])] as ChatMessage[],
      "analyst-chat-v1",
      1400,
    );
    const { licensingDb } = await import("@core/licensing/db");
    await licensingDb().touchCode(validation.codeHash!, Date.now());
    // JSON-mode providers wrap the answer; accept both shapes.
    const reply =
      typeof result.data === "string"
        ? result.data
        : result.data?.reply ?? result.data?.answer ?? null;
    if (!reply) {
      return NextResponse.json({ ok: false, error: "analyst returned an empty response" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, reply, meta: result.meta });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
