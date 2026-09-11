# PRODUCTION ACCEPTANCE — TruffleTrade

Date: 2026-09-11 · Every entry below reflects a check actually executed during this pass.

## Verified (evidence exists)

- **Typecheck**: `npx tsc --noEmit` → 0 errors (run after every change).
- **Tests**: `npm test` → **17 files / 142 tests PASS**, including 26 new:
  paper engine invariants (15), paper store isolation/audit (8), fulfillment idempotency (3).
- **Production build**: `npm run build` → clean; `/paper` route present (static, behind guard at runtime).
- **Dependency audit**: `npm audit --omit=dev` → **0 vulnerabilities** (critical Next.js SSRF
  GHSA-p9j2-gv94-2wf4 fixed earlier in this pass by upgrading to Next 16.3.4; typecheck/tests/build re-verified after upgrade).
- **Secret scan**: credential-pattern grep over tracked files → clean (CI now enforces the same).
- **Authorization (live)**: anonymous `GET /api/paper` → 401 on Vercel (no TT_ACCESS_CODE server-side);
  anonymous `POST /api/research` → 401 (verified earlier this project); local operator path validated via server-side code.
- **Paper trading end-to-end (live, Neon Postgres)**: portfolio GET ok; market buy of 1 AAPL filled at
  $335.0247 with fee $0.168 + slippage $0.335 and provenance (source `yahoo:chart`, timestamped);
  oversell attempt ($33.4M notional) **blocked by risk engine before simulation** (422 RISK_BLOCK);
  assumptions echoed to the client; SIMULATED disclaimers in every payload and the UI.
- **Health endpoint**: admin/code-gated; reports DB reachable (postgres), AI/payments/admin config, feature flags, AI usage stats.
- **Audit trail**: license issued/extended/revoked, payment verified, paper fills/rejections all append
  to `tt_audit_events` with hashed actors (no raw codes).
- **Deployment**: pushed to GitHub → Vercel auto-deploy; smoke checks on production URLs.

## Failed (found and FIXED this pass — listed for honesty)

- Risk kill-switch message printed drawdown as a raw fraction (0.15% instead of 15%) — fixed + regression test.
- JSONB round-trip bug: pg returns parsed objects; naive `String()` produced `"[object Object]"`
  and 503s on /api/paper — fixed via `jsonbText` normalizer; re-tested live.
- Overlapping queries on the shared pg Client (deprecation + correctness) — serialized.
- Audit doc previously claimed model router / structured logging / CI hardening as done when they
  were not — corrected; all three now actually implemented (core/research/router.ts,
  core/observability.ts, hardened ci.yml).

## Unverified (could not be tested here — do not assume)

- Neon point-in-time restore drill (documented only).
- Electron NSIS installer end-to-end on a clean machine (`npm run app:dist` untested in CI).
- Playwright E2E in CI (interactive browser verification used instead).
- Load behavior of the gateway under many concurrent subscribers.
- Calibration metrics over a real forecast history (needs months of live data).

## Security summary

Guard on every AI-burning route (verified 401); admin API token-gated and disabled when unset;
paper state isolated by access-code hash with cross-user read-denial tests; secrets server-side
only; audit trail append-only with hashed actors; input validation (zod strict) on paper routes;
secret scan + `npm audit --omit=dev --audit-level=high` gates in CI. Residual risks enumerated in
docs/THREAT-MODEL.md (notably: shared code = shared seat; multi-tenant accounts not implemented).

## Performance summary

Measured (informal): production build ~40s; test suite ~6s; research council run (9 agents,
parallel) previously observed ~40s on operator Groq; paper order round-trip (incl. live Yahoo mark
+ Neon writes) ~1.5s. p50/p95 AI latency now tracked via the router and exposed at /api/health.
No formal load testing performed.

## Database summary

Additive idempotent schema on SQLite + Neon; CHECK constraints enforce accounting invariants
(negative-quantity insert tested to throw); JSONB/SQLite text normalization handled; pg Client
query serialization fixed; backups documented, restore UNVERIFIED.

## AI summary

GroqProvider retry logic regression-tested; malformed AI output rejected; red-team unavailable ⇒
no thesis (fail-closed, tested); per-minute AI budget enforced (fail-closed); usage/latency tracked;
prompt versions recorded on every output. Model: gpt-oss-120b (reasoning/verification/synthesis),
llama-3.1-8b-instant (fast) — configurable via env.

## Paper trading summary

Long-only; fees (5 bps) + adverse slippage (10 bps) applied and disclosed; avg-cost accounting with
realized/unrealized P/L; position/exposure/order-notional caps + drawdown kill switch (sells stay
allowed) + data-quality block, all deterministic and outside AI influence; every state change audited.

## Deployment summary

GitHub main → Vercel auto-deploy (verified across multiple pushes today). Rollback = promote prior
deployment (documented). Env vars managed in Vercel; set-env script masks values.

## Remaining risks (not hidden)

1. Access codes are bearer tokens — sharing leaks the seat; mitigate by revoke (admin) + rate limits.
2. Research-run history does not persist on Vercel (read-only FS) — local-device only until migrated to Postgres.
3. Backup restore drill not yet executed.
4. Single-operator support model; no true multi-tenant user accounts yet.
5. Free market-data endpoints depend on Yahoo's unofficial API — upstream changes could degrade
   charts/quotes (fail-closed states exist; no alternate provider wired).

**Verdict per spec §3: the application is deployable and commercially operating, but the
UNVERIFIED items above mean the label "production ready" is withheld until they are closed.**
