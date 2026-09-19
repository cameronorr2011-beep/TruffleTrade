// Model router (spec §23). Providers are swappable; agents can use different models.
// Every call records provider, model, timestamp, prompt version (§24).

export type ProviderKind = "groq" | "openai" | "anthropic" | "google" | "local";

export interface AiCallMeta {
  provider: ProviderKind;
  model: string;
  promptVersion: string;
  ts: number;
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface AiResult<T> {
  data: T;
  meta: AiCallMeta;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ReasoningEffort = "low" | "medium" | "high";

/** Per-call knobs. Reasoning effort only applies to reasoning-capable models (gpt-oss, qwen3, deepseek-r1). */
export interface ChatOptions {
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
}

export interface AIProvider {
  readonly kind: ProviderKind;
  readonly model: string;
  chatJson<T>(messages: ChatMessage[], promptVersion: string, maxTokens?: number, opts?: ChatOptions): Promise<AiResult<T>>;
}

/**
 * Models on Groq that accept `reasoning_effort: low|medium|high`. Only the
 * gpt-oss family uses this ladder (qwen3 takes none|default, kimi-k2 rejects
 * the field) — sending it anywhere else is a 400 on every call.
 */
export function supportsReasoning(model: string): boolean {
  return /gpt-oss/i.test(model);
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GroqResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
  error?: { message?: string };
}

/** Retry 429/5xx with backoff (free-tier TPM limits make this routine, not exceptional). */
async function groqFetch(apiKey: string, body: string, maxAttempts = 4): Promise<{ res: Response; j: GroqResponse }> {
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(90_000),
    });
    const j = (await res.json().catch(() => ({}))) as GroqResponse;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable) {
      if (!res.ok || j.error) throw new Error(`Groq: ${j.error?.message ?? `HTTP ${res.status}`}`);
      return { res, j };
    }
    lastError = j.error?.message ?? `HTTP ${res.status}`;
    if (attempt === maxAttempts) break;
    // Groq reports wait time in the message ("Please try again in 6.1s") and header.
    const headerWait = Number(res.headers.get("retry-after"));
    const msgWait = /try again in ([\d.]+)s/i.exec(lastError)?.[1];
    const waitS = Number.isFinite(headerWait) && headerWait > 0 ? headerWait : msgWait ? Number(msgWait) : 2 ** attempt;
    await sleep(Math.min(30_000, Math.ceil(waitS * 1000) + 500));
  }
  throw new Error(`Groq: ${lastError} (after ${maxAttempts} attempts)`);
}

export class GroqProvider implements AIProvider {
  readonly kind: ProviderKind = "groq";
  constructor(
    private apiKey: string,
    public model: string,
  ) {}

  async chatJson<T>(messages: ChatMessage[], promptVersion: string, maxTokens = 2200, opts: ChatOptions = {}): Promise<AiResult<T>> {
    const started = Date.now();
    const body = JSON.stringify({
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      response_format: { type: "json_object" },
      temperature: opts.temperature ?? 0.35,
      // Reasoning tokens count against the completion budget on gpt-oss, so
      // callers requesting "high" must pass a larger maxTokens (router does).
      max_completion_tokens: maxTokens,
      ...(supportsReasoning(this.model) ? { reasoning_effort: opts.reasoningEffort ?? "low" } : {}),
    });
    const { j } = await groqFetch(this.apiKey, body);
    const content = j.choices?.[0]?.message?.content ?? "";
    return {
      data: parseJsonLoose<T>(content),
      meta: {
        provider: this.kind,
        model: this.model,
        promptVersion,
        ts: Date.now(),
        durationMs: Date.now() - started,
        tokensIn: j.usage?.prompt_tokens ?? null,
        tokensOut: j.usage?.completion_tokens ?? null,
      },
    };
  }
}

/**
 * GatewayProvider — calls the TruffleTrade gateway (Vercel) which holds the
 * Groq credential. Subscribers never hold an AI API key: the local app ships
 * with TT_GATEWAY_URL + their access code, and the gateway validates the
 * subscription, rate-limits, and forwards to Groq server-side.
 */
export class GatewayProvider implements AIProvider {
  readonly kind: ProviderKind = "groq";
  constructor(
    private gatewayUrl: string,
    private accessCode: string,
    public model: string = "openai/gpt-oss-120b",
  ) {}

  async chatJson<T>(messages: ChatMessage[], promptVersion: string, maxTokens = 2200, opts: ChatOptions = {}): Promise<AiResult<T>> {
    const started = Date.now();
    const res = await fetch(`${this.gatewayUrl.replace(/\/$/, "")}/api/gateway/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-code": this.accessCode },
      body: JSON.stringify({
        messages,
        model: this.model,
        maxTokens,
        promptVersion,
        reasoningEffort: opts.reasoningEffort,
        temperature: opts.temperature,
      }),
      signal: AbortSignal.timeout(150_000),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      data?: T;
      meta?: { provider: ProviderKind; model: string; tokensIn: number | null; tokensOut: number | null };
    };
    if (!res.ok || !j.ok || j.data === undefined) {
      throw new Error(`Gateway (${res.status}): ${j.error ?? "request failed"}`);
    }
    return {
      data: j.data,
      meta: {
        provider: "groq",
        model: j.meta?.model ?? this.model,
        promptVersion,
        ts: Date.now(),
        durationMs: Date.now() - started,
        tokensIn: j.meta?.tokensIn ?? null,
        tokensOut: j.meta?.tokensOut ?? null,
      },
    };
  }
}

/**
 * JSON-mode models occasionally wrap the object in a code fence or emit a
 * stray preamble; recover the outermost object instead of failing the call.
 */
export function parseJsonLoose<T>(content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(content.slice(start, end + 1)) as T;
    throw new Error("model returned non-JSON content");
  }
}

/** Placeholder provider for tests/offline — returns empty data, marked clearly. */
export class EchoProvider implements AIProvider {
  readonly kind: ProviderKind = "local";
  constructor(public model = "echo-1") {}
  async chatJson<T>(messages: ChatMessage[], promptVersion: string): Promise<AiResult<T>> {
    void messages;
    return {
      data: {} as T,
      meta: {
        provider: this.kind,
        model: this.model,
        promptVersion,
        ts: Date.now(),
        durationMs: 0,
        tokensIn: null,
        tokensOut: null,
      },
    };
  }
}

export function makeProvider(accessCode?: string): AIProvider {
  const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

  // Subscriber path: no local Groq key — everything goes through the gateway
  // with the SUBSCRIBER'S OWN code (passed in from the request; never read
  // from env — a keyless install must behave exactly like a customer's).
  const gatewayUrl = process.env.TT_GATEWAY_URL?.trim();
  const code = accessCode?.trim();
  if (gatewayUrl && code) {
    return new GatewayProvider(gatewayUrl, code, model);
  }

  // Operator path: you (the operator) hold GROQ_API_KEY directly.
  const key = process.env.GROQ_API_KEY?.trim() ?? "";
  if (!key) {
    throw new Error(
      "No AI backend configured. Subscribers: set TT_GATEWAY_URL and provide your access code in the app. Operator: set GROQ_API_KEY.",
    );
  }
  return new GroqProvider(key, model);
}
