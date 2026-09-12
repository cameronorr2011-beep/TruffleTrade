# PRODUCTION AUDIT — TruffleTrade

Date: 2026-09-11 · Auditor: production-engineering pass · Commit at audit: see git log

## 1. Verified baseline (commands actually run at audit time)

| Check | Command | Result |
|---|---|---|
| Install | `npm install` | PASS (allow-scripts warnings reviewed; benign) |
| Typecheck | `npx tsc --noEmit` | PASS (0 errors) |
| Test suite | `npm test` | PASS — 142 tests / 17 files (after this pass's additions) |
| Production build | `npm run build` | PASS (Next 16, Turbopack, 13 routes prerendered) |
| Dependency audit (prod) | `npm audit --omit=dev` | **0 vulnerabilities** (was 3: critical Next.js SSRF GHSA-p9j2-gv94-2wf4, high postcss ×2, high sharp — fixed by upgrading Next to 16.3.4, verified typecheck+tests+build after) |
| Live API smoke (prior pass; historical) | Neon-backed dev server | PASS — guard 401s, health, and the (since removed) paper engine verified end-to-end; JSONB round-trip bug found & fixed during that smoke |
| Secret scan (tracked files) | `git grep` for key material patterns | CLEAN — no secrets in repo; `.env` gitignored (verified patterns: npg_, vcp_, sk-, live TT- codes) |

## 2. Current architecture (verified by code inspection)

- **Research engine** (`core/research/`): deterministic pipeline — providers (Yahoo chart/summary, Google News RSS, macro), technicals (code-computed), valuation (DCF/reverse-DCF/comps), 9-agent council run in parallel, deterministic fact-check of numeric claims vs the data pack, fail-closed red team (unreachable → REJECT), evidence-weighted consensus, thesis with invalidation conditions, direction-only forecasts persisted and resolved against live prices.
- **AI provider layer** (`core/research/ai.ts`): GroqProvider with 429/5xx retry honoring `retry-after`; GatewayProvider (subscriber path — no local key); EchoProvider for offline. Retry regression tests exist and pass.
- **Memory** (`core/memory/`): SQLite episodic facts + consolidation + digital-twin trainer (block bootstrap, seeded) + federated push/pull (hashed subjects, kind counts only). Auto-updater runs every 6h in long-lived processes (`src/instrumentation.ts`, skipped on Vercel).
- **Licensing** (`core/licensing/`): HMAC-checksummed access codes, hashed storage (Postgres/Neon or SQLite), idempotent fulfillment keyed on ZBD charge id, manual Wallet-of-Satoshi fallback with operator approval, admin API token-gated.
- **Gateway** (`src/app/api/gateway/*`): AI proxy holding `GROQ_API_KEY` server-side; validates code → rate-limit → forward. Verified live earlier: anonymous requests rejected 401; valid code passes.
- **Guard** (`src/lib/guard.ts`): operator-token mode OR access-code mode for AI-burning routes.
- **Desktop** (`electron/main.js`): native shell around the local app, spawns `next start`, single-instance, tray; NSIS packaging configured (`npm run app:dist`).
- **MCP** (`mcp/server.ts`): tools for run_research / candles / news / macro / verify_access / desk tools.
- **Persistence**: SQLite (local research runs, watchlist, memory) + Postgres/Neon (licenses, payments, federation). Schema auto-create exists; migration runner `scripts/migrate.ts`.

## 3. Gaps identified (this spec's remediation targets)

1. **Paper-trading engine** — was built to spec §19/20 in the prior pass, then **REMOVED by product decision** (2026-09-11): TruffleTrade is an analysis product and never places stock trades. `tt_paper_*` tables dropped from Neon; paper_* audit rows purged; tests removed with the module.
2. **No audit trail** — licensing state changes and admin actions were not logged to an append-only store. *(ADDED: tt_audit_events, dual-backend, wired into fulfillment/admin; store now lives in `core/audit.ts`.)*
3. **No model router** — model/provider selection ad hoc; no cost/latency tracking or token budgets. *(ADDED this pass: core/research/router.ts — task classes, budgets, per-minute fail-closed cap, usage stats at /api/health, wired into council + red team.)*
4. **No structured logging** — inconsistent console logging; no requestId/duration. *(ADDED this pass: core/observability.ts withLogging(); adoption across routes is incremental.)*
5. **Next.js critical CVE** — SSRF via rewrites. **Fixed** (16.3.4), verified.
6. **`/api/research` on Vercel** — engine touches SQLite for research-run storage; serverless filesystem is read-only → run persisted locally only. Documented as known limitation (PRODUCTION-AUDIT §3a); Postgres-backed storage is the remediation path (NOT done in this pass — see acceptance report).
7. **Sharp build scripts** — `npm warn allow-scripts` for sharp/electron-winstaller install scripts. Reviewed: expected native binary fetches; flagged in OPERATIONS.md.
8. **No CI security checks** — workflow lacked secret scanning and dependency audit. *(ADDED this pass: broad credential-pattern scan + `npm audit --omit=dev --audit-level=high` gate in ci.yml.)*

### 3a. Known limitation: research persistence on serverless
`runResearch()` calls `saveResearchRun()` (SQLite). On Vercel, writes fail gracefully (engine catches) — analysis still returns to the client, but run history is local-device. Cross-device research history requires migrating research storage to Postgres. Marked UNVERIFIED-FIX in acceptance report.

## 4. Remediation order (executed in this pass)

1. Dependency critical fix (Next.js) ✅
2. Paper trading + risk engines with invariant tests ✅ (26 tests; live-verified against Neon incl. risk-blocked oversell)
3. Audit log + migration ✅ (tt_audit_events; wired into fulfillment + admin + paper)
4. Model router + observability ✅ (core/research/router.ts + core/observability.ts — implemented this pass)
5. Docs ✅ (SECURITY / THREAT-MODEL / OPERATIONS / DATABASE / TESTING / MODEL-SYSTEM / PRODUCTION / PRODUCTION-ACCEPTANCE — written this pass, describing real behavior)
6. CI hardening ✅ (secret scan + dependency audit gates)

## 5. Still open (honest list)

- Cross-user data isolation is structural (per-device SQLite; gateway has no multi-tenant user records) — acceptable for single-operator-per-code model, documented in THREAT-MODEL.md. True multi-user accounts are NOT implemented.
- No e2e browser test in CI (browser-automation used interactively instead; a Playwright CI job is a follow-up).
- Backup/restore for Neon documented (OPERATIONS.md) but a live restore drill was NOT executed — UNVERIFIED.
- Prompt files remain in `core/research/prompts.ts` (versioned in code) rather than a separate `prompts/` directory — acceptable, documented.
