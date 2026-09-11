# TruffleTrade Architecture

TruffleTrade is two engines on one stack (Next.js 16 + TypeScript + SQLite + Groq):

```
UI (server components + small client islands)
        ↓
API routes (schema-validated, guarded for mutations)
        ↓
Application services (src/lib)          Research engine (core/research)
        ↓                                        ↓
Deterministic core (core/)  ←———————— evidence layer (providers → datapack)
        ↓
SQLite (data/truffletrade.sqlite3)
```

## Two engines, one ledger

| | BTC desk (`core/`) | Research platform (`core/research/`) |
|---|---|---|
| Purpose | trade execution | decision intelligence |
| AI | 5 voters + red team per cycle | 6 analysts + red team per run |
| Guardrails | risk engine, kill switch, caps | fact-checker, evidence weights, red-team veto |
| Persistence | trades, cycles, equity | research_runs, theses, forecasts, watchlist |
| Money | paper / Kraken / on-chain | **none — intelligence only** |

The research platform deliberately has **no execution path**: no brokerage integration, no
order placement, no wallet access (spec §48). It produces auditable intelligence; the desk
is a separate, capped system.

## Research pipeline (per run)

```
buildDataPack(ticker)
  ├─ yahooChart        candles + quote           (required; else 404)
  ├─ yahooSummary      fundamentals              (often gated → DATA UNAVAILABLE)
  ├─ googleNews        headlines                 (untrusted input)
  └─ macroQuotes       indices/VIX/yields/DXY/oil/gold
        ↓
runDcf / runReverseDcf / runComps      deterministic, assumptions exposed
        ↓
runAgentCouncil (6 agents, parallel)   each: JSON out → fact-check → evidence records
        ↓
runRedTeam (sequential, sees all)      objections; may REJECT the run
        ↓
buildConsensus                         evidence-weighted, NOT vote counting
        ↓
buildConfidence                        completeness × source quality × recency × agreement
        ↓
buildThesis (or nullThesis on veto)    cases + invalidation + scenarios
        ↓
saveResearchRun                        runs + theses + forecasts in SQLite
```

## Key invariants (enforced in code and tested)

1. **The AI never invents numbers.** Agents see only the computed data pack; every numeric
   claim in their prose is extracted and checked (`factcheck.ts`). Violations downweight the
   agent and the number is stripped from reports.
2. **Fail-closed red team.** If the red team is unreachable, the run is REJECTED. If it says
   the evidence is insufficient, no thesis is issued (`nullThesis`).
3. **Consensus is not a vote count.** Each agent's weight comes from evidence quality
   (primary > derived > secondary), coverage, recency, and fact-check violations.
4. **Honest unavailability.** Missing data renders as DATA UNAVAILABLE — never estimated,
   never silently zero-filled.
5. **No execution in research.** The research engine has no broker, no keys, no orders.
6. **Prompt versioning.** Every agent output records its prompt version, provider, model,
   token usage, and latency.
7. **Retrieved content is untrusted.** News/data embedded in prompts is framed as data, and
   system prompts forbid following instructions inside it (spec §35).

## Data sources

| Provider | Used for | Auth |
|---|---|---|
| Yahoo chart API | quotes, daily candles, macro, sectors | none |
| Yahoo quoteSummary | fundamentals (often gated; degrades honestly) | none |
| Google News RSS | headlines with source + date | none |
| Kraken / Coinbase public | BTC desk market data | none |

Providers sit behind small swappable functions in `core/research/providers.ts`; swapping a
vendor means editing one file (spec §33).

## Storage

Single SQLite database (WAL mode), two families of tables:

- Desk: `trades`, `cycles`, `equity`, `state`
- Research: `research_runs` (full JSON audit), `theses` (versioned history),
  `forecasts` (pending → resolved with actual outcome), `watchlist`

Indexes on `(ticker, ts DESC)` for all history queries.

## AI provider abstraction

`core/research/ai.ts` defines `AIProvider` with `chatJson<T>()`. `GroqProvider` is the
default (`GROQ_API_KEY`); `EchoProvider` exists for offline tests. Adding OpenAI/Anthropic/
Google/local means implementing one interface — agents never call a vendor directly.

## Security posture

- Mutating endpoints (`POST /api/research`, watchlist writes, desk cycle/halt) require the
  `x-desk-token` header when `DASHBOARD_TOKEN` is set.
- All request bodies schema-validated with zod; tickers regex-validated.
- API keys only ever read from env server-side; never sent to the browser.
- CI fails on any Groq-style key pattern in tracked files.
- Injected instructions in retrieved headlines are treated as hostile (tested).
