# MODEL-SYSTEM — TruffleTrade

## Providers

- **GroqProvider** (`core/research/ai.ts`): operator path. Retries 429/5xx honoring
  `retry-after`; gives up after 4 attempts and surfaces the rate-limit error (tested).
- **GatewayProvider**: subscriber path — calls the hosted gateway
  (`TT_GATEWAY_URL`) which injects the server-side `GROQ_API_KEY`. Subscribers
  never hold AI keys.
- **EchoProvider**: deterministic offline fallback for tests/dev.

Every call returns `AiCallMeta`: provider, model, promptVersion, duration, tokensIn/Out.

## Model router (minimal, real — `core/research/router.ts`)

- Task classes: FAST / REASONING / VERIFICATION / SYNTHESIS mapped per operation
  (agent key, red_team, synthesis).
- Budgets: per-class maxTokens + timeouts; per-minute AI call budget
  (`AI_CALLS_PER_MINUTE`, default 120) enforced before each AI call — exhausted
  budget fails closed (agent recorded as insufficient-evidence, never invented).
- Usage tracking: rolling 500-call window with p50/p95 latency, error rate,
  per-class counts — exposed via `/api/health`.
- Model selection: FAST → `llama-3.1-8b-instant` (or `GROQ_MODEL_FAST`);
  REASONING/VERIFICATION/SYNTHESIS → `GROQ_MODEL` (default `gpt-oss-120b`).

Wired at: `runAgentCouncil` (9 agents) and red team in `core/research/agents.ts`.

## Prompt versioning

Prompts live in `core/research/prompts.ts` with per-agent `promptVersion()`
strings recorded on every `AgentOutput` and persisted with research runs —
historical analyses retain the exact prompt version used. Changing a prompt
REQUIRES bumping its version string (convention; enforced by review, not lint).

## Failure handling (fail closed)

- Agent error (network/JSON/budget) → stance `insufficient-evidence`, confidence 0,
  recorded with failure reason. Never fabricated content.
- Red team unreachable → REJECT (no thesis published). Tested.
- Fact-check statuses: VERIFIED / PARTIALLY_VERIFIED / UNVERIFIED / CONTRADICTED /
  UNAVAILABLE — silent upgrade is blocked and tested.

## Forecast calibration

Forecasts are persisted with direction + horizon and resolved against live
prices; outcome rows feed memory. Aggregate calibration curves (Brier/reliability)
are NOT yet built — marked UNVERIFIED in the acceptance report.

## What the system does NOT claim

No probability statements from uncalibrated confidence; no future-performance
guarantees; model outputs are labeled MODEL OUTPUT vs FACT vs ASSUMPTION in the UI.
