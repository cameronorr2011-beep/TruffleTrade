// Minimal-but-real model router (spec §13, §44). Provider-independent task
// routing with budgets, latency/token tracking, and explicit failure records.
// The research engine's GroqProvider remains the transport; this router adds
// the accounting/selection layer on top so provider changes don't ripple.

export type TaskClass = "FAST" | "REASONING" | "VERIFICATION" | "SYNTHESIS";

export interface ModelSelection {
  provider: string;
  model: string;
  taskClass: TaskClass;
  maxTokens: number;
  timeoutMs: number;
}

export interface UsageRecord {
  requestId: string;
  operation: string;
  taskClass: TaskClass;
  provider: string;
  model: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  status: "ok" | "error";
  failureReason?: string;
  at: number;
}

/** Task class per engine role. Kept in one place so tuning is auditable. */
const CLASS_BY_OPERATION: Record<string, TaskClass> = {
  agent_fundamentals: "REASONING",
  agent_valuation: "REASONING",
  agent_technicals: "FAST",
  agent_macro: "FAST",
  agent_competition: "REASONING",
  agent_news: "FAST",
  agent_chart_patterns: "FAST",
  agent_scenario: "REASONING",
  agent_backtest: "FAST",
  fact_check: "VERIFICATION",
  red_team: "VERIFICATION",
  synthesis: "SYNTHESIS",
};

// Budgets per task class (token ceilings and hard timeouts).
const BUDGETS: Record<TaskClass, { maxTokens: number; timeoutMs: number }> = {
  FAST: { maxTokens: 1_200, timeoutMs: 25_000 },
  REASONING: { maxTokens: 2_000, timeoutMs: 45_000 },
  VERIFICATION: { maxTokens: 1_500, timeoutMs: 35_000 },
  SYNTHESIS: { maxTokens: 2_200, timeoutMs: 50_000 },
};

// Model preference per task class (provider-qualified). The gateway/operator
// path may override the model via GROQ_MODEL; fallback keeps runs alive.
const MODEL_BY_CLASS: Record<TaskClass, string> = {
  FAST: process.env.GROQ_MODEL_FAST?.trim() || "llama-3.1-8b-instant",
  REASONING: process.env.GROQ_MODEL?.trim() || "gpt-oss-120b",
  VERIFICATION: process.env.GROQ_MODEL?.trim() || "gpt-oss-120b",
  SYNTHESIS: process.env.GROQ_MODEL?.trim() || "gpt-oss-120b",
};

const recent: UsageRecord[] = [];
const RECENT_LIMIT = 500;

export function selectModel(operation: string): ModelSelection {
  const taskClass = CLASS_BY_OPERATION[operation] ?? "REASONING";
  const budget = BUDGETS[taskClass];
  return {
    provider: "groq",
    model: MODEL_BY_CLASS[taskClass],
    taskClass,
    maxTokens: budget.maxTokens,
    timeoutMs: budget.timeoutMs,
  };
}

export function recordUsage(rec: Omit<UsageRecord, "at">): void {
  recent.push({ ...rec, at: Date.now() });
  if (recent.length > RECENT_LIMIT) recent.splice(0, recent.length - RECENT_LIMIT);
}

/** Aggregate usage stats for /api/health and admin views (no secrets). */
export function usageStats(): {
  totalRequests: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  byClass: Record<string, { count: number; errors: number }>;
} {
  const n = recent.length;
  const latencies = recent.map((r) => r.latencyMs).sort((a, b) => a - b);
  const errors = recent.filter((r) => r.status === "error").length;
  const byClass: Record<string, { count: number; errors: number }> = {};
  for (const r of recent) {
    byClass[r.taskClass] ??= { count: 0, errors: 0 };
    byClass[r.taskClass].count++;
    if (r.status === "error") byClass[r.taskClass].errors++;
  }
  return {
    totalRequests: n,
    errorRate: n ? errors / n : 0,
    p50LatencyMs: n ? latencies[Math.floor(n * 0.5)] : 0,
    p95LatencyMs: n ? latencies[Math.min(latencies.length - 1, Math.floor(n * 0.95))] : 0,
    byClass,
  };
}

/** Per-operation AI budget: hard cap on calls within a rolling window. */
const WINDOW_MS = 60_000;
const MAX_CALLS_PER_WINDOW = Number(process.env.AI_CALLS_PER_MINUTE?.trim() || 120);
const windowCalls: number[] = [];

export function aiBudgetAvailable(): boolean {
  const now = Date.now();
  while (windowCalls.length && now - windowCalls[0] > WINDOW_MS) windowCalls.shift();
  return windowCalls.length < MAX_CALLS_PER_WINDOW;
}

export function consumeAiBudget(): boolean {
  if (!aiBudgetAvailable()) return false;
  windowCalls.push(Date.now());
  return true;
}
