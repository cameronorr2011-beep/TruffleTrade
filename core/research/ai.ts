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
  role: "system" | "user";
  content: string;
}

export interface AIProvider {
  readonly kind: ProviderKind;
  readonly model: string;
  chatJson<T>(messages: ChatMessage[], promptVersion: string, maxTokens?: number): Promise<AiResult<T>>;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export class GroqProvider implements AIProvider {
  readonly kind: ProviderKind = "groq";
  constructor(
    private apiKey: string,
    public model: string,
  ) {}

  async chatJson<T>(messages: ChatMessage[], promptVersion: string, maxTokens = 2200): Promise<AiResult<T>> {
    const started = Date.now();
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        response_format: { type: "json_object" },
        temperature: 0.35,
        max_completion_tokens: maxTokens,
        reasoning_effort: "low",
      }),
      signal: AbortSignal.timeout(90_000),
    });
    interface GroqResponse {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
      error?: { message?: string };
    }
    const j = (await res.json()) as GroqResponse;
    if (!res.ok || j.error) {
      throw new Error(`Groq: ${j.error?.message ?? `HTTP ${res.status}`}`);
    }
    const content = j.choices?.[0]?.message?.content ?? "";
    return {
      data: JSON.parse(content) as T,
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

export function makeProvider(): AIProvider {
  const key = process.env.GROQ_API_KEY?.trim() ?? "";
  const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
  if (!key) {
    throw new Error("GROQ_API_KEY is required for the research engine. Copy .env.example to .env and set it.");
  }
  return new GroqProvider(key, model);
}
