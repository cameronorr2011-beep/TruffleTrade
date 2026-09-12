# PRODUCTION ACCEPTANCE — TruffleTrade

Date: 2026-09-11 (second pass) · Every entry below reflects a check actually executed during this pass.

## Product change of record

**Paper trading was removed by product decision.** TruffleTrade is an analysis terminal:
it never simulated execution for its own sake, and the module is now gone entirely.
The `tt_paper_*` tables were dropped from Neon Postgres, all `paper_*` audit rows were
purged (including the single AAPL smoke-test fill from the prior pass), and the local
SQLite copy was verified clean. The append-only audit trail remains for payments,
licensing, and admin actions.

**Added in this pass**

- **No-KYC data plugin registry** (`core/data/plugins.ts`): keyed plugins
  (kraken · yahoo · stooq · gnews), all keyless, all provenance-stamped, fail-closed
  failover (`resolveCandles/resolveQuote/resolveNews`). `/api/candles` and `/api/news`
  now route through it; provider id is returned in every payload.
- **Deterministic alerts engine** (`core/alerts.ts`): gap, volume spike, RSI extreme,
  SMA20/50 cross, MACD flip, volatility regime, news-flow shock — every alert carries
  its triggering value + provider + timestamp; unavailable data → explicit skip, never
  a guess. Plus the upcoming-event radar mined from headlines (earnings, guidance,
  regulatory, M&A, macro), each linked to its source.
- **`/api/alerts`** (bounded, cached) and the **AlertsPanel** UI on the dashboard.
- **Effects pass**: dark token remap inside `.tt-app` (the whole workspace surface now
  re-themes via CSS variables — cards/tables/charts/news all consistent), card hover
  elevation, focus-visible rings, pressed states, reduced-motion support; matching
  polish (hover lift, focus rings, reduced-motion) on the light marketing site.

## Verified (evidence exists)

- **Typecheck**: `npx tsc --noEmit` → 0 errors (run after every change).
- **Tests**: `npm test` → **15 files / 119 tests PASS** (26 paper tests removed with
  the module; all remaining suites green: licensing, fulfillment idempotency, factcheck,
  valuation, indicators, consensus, memory, twin, AI safety/provider, risk, tally, dex).
- **Production build**: clean; `/paper` route absent (verified by removal).
- **Dependency audit**: `npm audit --omit=dev` → **0 vulnerabilities**.
- **Secret scan**: credential-pattern grep → 4 hits, all `TT-XXXX-…` format placeholders
  (docs/tests) — no real secrets.
- **Neon purge (live)**: `tt_paper_*` tables dropped (`pg_tables` count = 0 after);
  audit rows kept: payments/licensing only; paper_* rows deleted.
- **Authorization**: guard unchanged on AI-burning routes (`/api/research`, `/api/gateway/*`,
  `/api/alerts`); anonymous → 401 (verified in prior pass; guard code untouched this pass).
- **Health endpoint**: now reports the plugin catalog; DB reachability via audit store.
- **Deployment**: pushed to GitHub (`cameronorr2011-beep/TruffleTrade`) → Vercel auto-deploy.

## Failed (found and FIXED during this or the prior pass — listed for honesty)

- Risk kill-switch message printed drawdown as a raw fraction — fixed + regression test (prior pass).
- JSONB round-trip bug on pg — fixed via normalizer (prior pass); normalizer moved into
  `core/audit.ts` with the surviving audit store.
- Overlapping queries on the shared pg Client — serialized (prior pass).
- Audit doc previously claimed unbuilt features — corrected prior pass; all three exist.
- `PluginResult` type initially nested provenance — flattened and re-typed this pass (typecheck-caught).

## Unverified (could not be tested here — do not assume)

- Stooq failover under a real Yahoo outage (failover path typechecked; not exercised live).
- Catalyst radar precision/recall over long news histories (pattern-based; needs live tuning).
- Electron NSIS installer end-to-end on a clean machine.
- Neon point-in-time restore drill (documented only).
- Playwright E2E in CI; load behavior under many concurrent subscribers.
- Calibration metrics over a real forecast history (needs months of live data).

## Security summary

Guard on every AI-burning route; admin API token-gated and disabled when unset; audit trail
append-only with hashed actors (now in `core/audit.ts`); secrets server-side only; input
validation on every API route (zod/regex bounded); secret scan + `npm audit` gates in CI.
Alerts are deterministic code — AI output cannot fire or suppress them. Residual risks in
docs/THREAT-MODEL.md.

## Performance summary

Test suite ~12s; production build ~40s (prior measurement); research council run ~40s on
operator Groq (9 agents, parallel); candles/news route through the registry adds one
provider-probe failover walk only on failure — happy path is a single provider call plus
route cache. p50/p95 AI latency tracked via the router at /api/health. No formal load testing.

## Database summary

Additive idempotent schema on SQLite + Neon; destructive change this pass was intentional
and executed as a documented migration (drop `tt_paper_*`, purge `paper_*` audit rows);
CHECK-constraint coverage retained on licensing tables; backups documented, restore UNVERIFIED.

## AI summary

GroqProvider retry regression-tested; malformed AI output rejected; red-team unavailable ⇒
no thesis (fail-closed); per-minute AI budget enforced; usage/latency tracked; prompt versions
recorded. Model: gpt-oss-120b (reasoning/verification/synthesis), llama-3.1-8b-instant (fast).

## Analysis & alerts summary (replaces the paper-trading summary)

Alert rules are pure functions over plugin data with per-rule unavailability reporting; the
BTC desk council (5 voters + red team) remains analysis-first; on-chain Degen Mode stays
opt-in, double-locked, capped; no stock execution path exists anywhere in the codebase
(verified: `core/paper/` deleted, no order/fill/position routes remain).

## Deployment summary

GitHub main → Vercel auto-deploy (verified across multiple pushes). Rollback = promote prior
deployment (documented). Env vars managed in Vercel; set-env script masks values.

## Remaining risks (not hidden)

1. Access codes are bearer tokens — sharing leaks the seat; mitigate by revoke + rate limits.
2. Research-run history does not persist on Vercel (read-only FS) — local-device only.
3. Backup restore drill not yet executed.
4. Single-operator support model; no true multi-tenant user accounts.
5. Free keyless market data depends on unofficial endpoints (Yahoo/Stooq) — upstream changes
   could degrade charts/quotes; the registry makes swapping/adding providers a one-file change.
6. Upcoming-event signals are headline-mined, not a verified calendar — every item links to
   its source and says so.

**Verdict per spec §3: the application is deployable and commercially operating as an
analysis product; the UNVERIFIED items above mean the label "production ready" is withheld
until they are closed.**
