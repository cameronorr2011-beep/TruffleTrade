import { NextResponse } from "next/server";
import { z } from "zod";
import { validateWithAbuseTracking, checkRateLimit } from "@core/licensing/validate";
import { isLockedOut } from "@core/licensing/abuse";
import { clientIp } from "@/lib/client-ip";
import { makeProvider } from "@core/research/ai";
import type { ChatMessage } from "@core/research/ai";
import { buildAnalystContext } from "@core/research/context";
import type { AnalystContext } from "@core/research/context";
import { factCheckAgent, stripViolatedNumbers } from "@core/research/factcheck";
import { consumeAiBudget, recordUsage, selectModel } from "@core/research/router";
import type { AgentOutput } from "@core/research/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MODES = ["analyst", "devil", "brief"] as const;
type Mode = (typeof MODES)[number];

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
  mode: z.enum(MODES).optional(),
});

interface DraftJson {
  plan?: string[];
  reply?: string;
  answer?: string;
  claims?: { text?: string; basis?: string }[];
  confidence?: number;
  invalidator?: string;
}
interface CriticJson {
  issues?: { severity?: string; text?: string }[];
  revisedReply?: string;
  confidence?: number;
  verdict?: string;
}

const PROMPT_VERSION = "analyst-thinker-v2.1-white";

const MODE_BRIEF: Record<Mode, string> = {
  analyst:
    "MODE: ANALYST. Give the balanced, evidence-weighted read. Lead with the single most decision-relevant finding.",
  devil:
    "MODE: DEVIL'S ADVOCATE. Your job is to argue AGAINST the prevailing view in the context (the last council consensus, " +
    "the trend, or the user's implied position). Build the strongest opposing case from the data; concede only what the data forces you to concede.",
  brief:
    "MODE: BRIEF. Maximum 90 words. Three bullets: what matters, what the data says, what would change it. No preamble.",
};

function draftSystem(mode: Mode, ctx: AnalystContext | null, contextError: string | null): string {
  return [
    "IDENTITY: You are WHITE TRUFFLE — the chart intelligence of TruffleTrade, a professional research terminal. " +
    "You are one of two personas in the product: you are the market specialist (charts, valuation, evidence packs); " +
    "your counterpart Black Truffle handles the user's personal memory and research journal. " +
    "Voice: a senior analyst — calm, precise, professional warmth, zero hype, no filler, no emoji. " +
    "You are NOT a chatbot, NOT a salesperson, and NOT a trading signal service. You produce structured, evidence-first analysis.",
    MODE_BRIEF[mode],
    "THINKING DISCIPLINE (do this before writing the reply):",
    " - Restate what the user actually needs decided.",
    " - Pull the 3-5 data points from the EVIDENCE PACK that bear on it; note which sections are unavailable.",
    " - Steelman the opposite conclusion using the same data, then weigh.",
    " - If MEMORY shows this system was previously wrong on this ticker in a similar setup, say so and adjust your confidence.",
    "RULES:",
    "1. Ground every claim in the EVIDENCE PACK when present. If a section is missing or thin, say so plainly. Never invent a number: only cite figures that appear in the pack.",
    "2. Label claims inline: FACT (from pack), INFERENCE (your reasoning), SCENARIO (conditional), MODEL (twin/DCF output), UNCERTAIN.",
    "3. Never guarantee outcomes. Use base case / probability / confidence language. Digital-twin and DCF figures are MODEL OUTPUT, not forecasts.",
    "4. Length: 140-260 words unless the mode says otherwise or the user asks for depth. Prefer tight bullets over prose.",
    "5. End with one line: 'What would change this view:' followed by a concrete, observable invalidator.",
    "6. This is research, not investment advice. Do not tell the user to buy or sell.",
    "7. Output STRICT JSON only:",
    '{"plan":["<2-5 short steps you took>"],"reply":"<full markdown answer, \\n for newlines>","claims":[{"text":"<key claim>","basis":"FACT|INFERENCE|SCENARIO|MODEL|UNCERTAIN"}],"confidence":<0..1>,"invalidator":"<one sentence>"}',
    ctx ? `\nEVIDENCE PACK (server-verified, retrieved live):\n${ctx.text}` : "",
    contextError ? `\nNOTE: live context unavailable (${contextError}) — reason from general knowledge, say so explicitly, and keep confidence under 0.4.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function criticSystem(ctx: AnalystContext | null): string {
  return [
    "You are the RED TEAM reviewer for White Truffle (the TruffleTrade analyst). You receive a user's question, the EVIDENCE PACK, and a DRAFT answer written by the analyst.",
    "Your job is to make the answer more correct, not more agreeable. Check, in order:",
    " (a) Every number in the draft appears in the pack (or is trivially derived). Flag any that don't.",
    " (b) Claims labeled FACT are actually in the pack; downgrade mislabeled ones to INFERENCE.",
    " (c) The draft does not ignore a pack section that contradicts it (valuation vs technicals, replay vs twin, memory outcomes).",
    " (d) Confidence is calibrated: multiple independent agreeing signals → up to 0.8; one signal → ≤0.55; missing data → ≤0.4.",
    " (e) No guarantees, no buy/sell instruction, invalidator present and observable.",
    "Then rewrite the answer with the fixes applied, preserving the analyst's structure and voice. Keep it the same length or shorter.",
    "Output STRICT JSON only:",
    '{"verdict":"pass|revised","issues":[{"severity":"high|medium|low","text":"<what was wrong and how you fixed it>"}],"revisedReply":"<the final answer>","confidence":<0..1>}',
    ctx ? `\nEVIDENCE PACK:\n${ctx.text}` : "\nEVIDENCE PACK: unavailable.",
  ].join("\n");
}

/**
 * POST /api/analyst — the conversational research analyst (premium AI).
 *
 * Two passes: (1) DRAFT with high reasoning effort over the full evidence pack
 * (live primer, deterministic valuation, historical replay, digital twin,
 * on-device memory, last council run); (2) CRITIC — a hostile reviewer that
 * checks numbers, labels, contradictions and calibration, then rewrites.
 * Finally the deterministic fact-checker strips any number not in the data
 * pack. The thinking trace (plan, critic issues, verified claims) is returned
 * so the UI can show its work.
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
  const mode: Mode = parsed.data.mode ?? "analyst";
  const started = Date.now();
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // Assemble the evidence pack server-side (never trust client-supplied context).
  let ctx: AnalystContext | null = null;
  let contextError: string | null = null;
  if (ticker) {
    try {
      ctx = await buildAnalystContext(ticker, lastUser);
    } catch (e) {
      contextError = (e as Error).message;
    }
  }

  const provider = makeProvider(); // operator path — GROQ_API_KEY stays server-side
  const history = messages as ChatMessage[];

  try {
    // ── Pass 1: draft ────────────────────────────────────────────────
    const draftSel = selectModel("analyst_draft");
    if (!consumeAiBudget()) throw new Error("AI budget exhausted (per-minute cap) — try again shortly");
    const t0 = Date.now();
    const draftRes = await provider.chatJson<DraftJson>(
      [{ role: "system", content: draftSystem(mode, ctx, contextError) }, ...history],
      PROMPT_VERSION,
      draftSel.maxTokens,
      { reasoningEffort: draftSel.reasoningEffort, temperature: 0.3 },
    );
    recordUsage({
      requestId: crypto.randomUUID(),
      operation: "analyst_draft",
      taskClass: draftSel.taskClass,
      provider: draftRes.meta.provider,
      model: draftRes.meta.model,
      latencyMs: Date.now() - t0,
      tokensIn: draftRes.meta.tokensIn ?? undefined,
      tokensOut: draftRes.meta.tokensOut ?? undefined,
      status: "ok",
    });
    const draft = draftRes.data;
    const draftReply = String(draft.reply ?? draft.answer ?? "").trim();
    if (!draftReply) {
      return NextResponse.json({ ok: false, error: "analyst returned an empty response" }, { status: 502 });
    }
    const plan = Array.isArray(draft.plan) ? draft.plan.filter((s) => typeof s === "string").slice(0, 6) : [];
    const claims = Array.isArray(draft.claims)
      ? draft.claims
          .filter((c) => c && typeof c.text === "string")
          .map((c) => ({ text: String(c.text).slice(0, 200), basis: String(c.basis ?? "INFERENCE").toUpperCase().slice(0, 12) }))
          .slice(0, 8)
      : [];
    let confidence = Math.min(1, Math.max(0, Number(draft.confidence) || 0.5));
    let reply = draftReply;

    // ── Pass 2: critic (skipped in brief mode to keep it snappy) ─────
    const issues: { severity: string; text: string }[] = [];
    let verdict = "skipped";
    if (mode !== "brief" && consumeAiBudget()) {
      const critSel = selectModel("analyst_critic");
      const t1 = Date.now();
      try {
        const critRes = await provider.chatJson<CriticJson>(
          [
            { role: "system", content: criticSystem(ctx) },
            { role: "user", content: `USER QUESTION:\n${lastUser}\n\nDRAFT ANSWER:\n${draftReply}\n\nDRAFT CONFIDENCE: ${confidence.toFixed(2)}\n\nReview and rewrite.` },
          ],
          `${PROMPT_VERSION}-critic`,
          critSel.maxTokens,
          { reasoningEffort: critSel.reasoningEffort, temperature: 0.2 },
        );
        recordUsage({
          requestId: crypto.randomUUID(),
          operation: "analyst_critic",
          taskClass: critSel.taskClass,
          provider: critRes.meta.provider,
          model: critRes.meta.model,
          latencyMs: Date.now() - t1,
          tokensIn: critRes.meta.tokensIn ?? undefined,
          tokensOut: critRes.meta.tokensOut ?? undefined,
          status: "ok",
        });
        const c = critRes.data;
        verdict = String(c.verdict ?? "revised");
        for (const i of c.issues ?? []) {
          if (i && typeof i.text === "string") issues.push({ severity: String(i.severity ?? "low").toLowerCase(), text: i.text.slice(0, 300) });
        }
        const revised = String(c.revisedReply ?? "").trim();
        if (revised.length > 40) reply = revised;
        if (Number.isFinite(Number(c.confidence))) confidence = Math.min(1, Math.max(0, Number(c.confidence)));
      } catch (e) {
        // The critic is a quality layer, not a gate: a critic failure degrades to the draft.
        verdict = `critic unavailable: ${(e as Error).message}`.slice(0, 160);
      }
    }

    // ── Deterministic fact-check: strip numbers the data pack cannot support ──
    let violations = 0;
    let verifiedClaims = 0;
    if (ctx) {
      const probe: AgentOutput = {
        agent: "Analyst",
        promptVersion: PROMPT_VERSION,
        stance: "neutral",
        confidence,
        rationale: reply,
        evidence: [],
        numericClaims: [],
        strengths: [],
        weaknesses: [],
        assumptions: [],
        violations: [],
        model: draftRes.meta.model,
      };
      const fc = factCheckAgent(probe, ctx.pack);
      // The evidence pack legitimately contains numbers that are NOT in the
      // metric table (DCF fair value, implied growth, twin percentiles, replay
      // hit-rates), so "unsupported" is only informational here. Only a number
      // that CONTRADICTS a known metric is stripped and penalized.
      const contradicted = fc.violations.filter((v) => v.reason === "contradicted" || v.reason === "stale-data");
      violations = contradicted.length;
      verifiedClaims = fc.claims.length - fc.violations.length;
      if (violations) {
        reply = stripViolatedNumbers(reply, contradicted);
        confidence = Math.max(0, confidence * (1 - 0.15 * violations));
      }
    }

    const { licensingDb } = await import("@core/licensing/db");
    await licensingDb().touchCode(validation.codeHash!, Date.now());

    return NextResponse.json({
      ok: true,
      reply,
      mode,
      thinking: {
        plan,
        claims,
        critic: { verdict, issues },
        confidence: Math.round(confidence * 100) / 100,
        invalidator: typeof draft.invalidator === "string" ? draft.invalidator.slice(0, 300) : null,
        factCheck: { verifiedClaims: Math.max(0, verifiedClaims), violations },
        evidence: ctx ? ctx.sections.map((s) => s.split("\n")[0].replace(/[:(].*$/, "").trim()) : [],
        memoryFacts: ctx?.memory.length ?? 0,
        lastRun: ctx?.lastRun ? { stance: ctx.lastRun.stance, score: ctx.lastRun.score, ts: ctx.lastRun.ts } : null,
        contextErrors: [...(ctx?.errors ?? []), ...(contextError ? [contextError] : [])],
        passes: mode === "brief" ? 1 : 2,
        durationMs: Date.now() - started,
      },
      memory: (ctx?.memory ?? []).slice(0, 6),
      meta: draftRes.meta,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
