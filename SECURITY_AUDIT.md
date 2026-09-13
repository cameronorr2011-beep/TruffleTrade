# Security audit — 2026-09-12

Findings from inspecting the actual repository (not a generic checklist). Severity inflation avoided; "Verified" means a test or live check proved the fix.

| # | Finding | Severity | Location | Risk | Fix | Verification |
|---|---------|----------|----------|------|-----|--------------|
| 1 | Stale Postgres socket crashed `guard()` outside try/catch → body-less 500s | High | `core/licensing/db.ts`, `src/lib/guard.ts` | Gateway unavailable; unparseable responses | Shared self-healing pg client (`core/pg.ts`) w/ timeouts + one retry; guard fails closed w/ JSON | CYAN research run 200 after 36h-server scenario; 503 JSON on DB failure |
| 2 | "% change" used window-start close → wrong market move shown (e.g. Dow −2% on a +1% day) | Medium | `core/research/providers.ts`, `core/data/plugins.ts` | Misleading financial data | Prior-session close derived from actual candles/meta everywhere; Kraken uses 24h open | Live check: ^DJI +0.98% / ^GSPC +0.86% match public quotes |
| 3 | Code verification endpoint had no rate limit → online brute-force possible (in principle) | Medium | `src/app/api/gateway/verify/route.ts` | Credential guessing | Per-IP sliding window (30/min default, env-tunable) | 429 after limit in local test |
| 4 | No security headers (CSP, HSTS, frame, MIME, referrer) | Medium | `next.config.ts` | XSS/Clickjacking/MIME surface | Full header set incl. CSP `frame-ancestors 'none'`; `no-store` on `/api/*` | curl -I on build output shows headers |
| 5 | Clients blind-parsed empty bodies (`res.json()`) → cryptic "Unexpected end of JSON input" | Low | `RunLauncher.tsx`, `SignalCardView.tsx` | Poor error UX masking real failures | Defensive parse + explicit status messaging | Reproduced empty-500 → clean message |
| 6 | `ADMIN_TOKEN`-gated admin routes — confirmed server-side check only | Info | `src/app/api/admin/**` | — | None needed (already correct) | Unauthorized request → 401 (existing test) |
| 7 | Access codes in localStorage | Info (accepted) | `src/lib/accessCodeClient.ts` | Local device compromise | Documented in SECURITY.md; revocation exists | Admin revoke endpoint test |
| 8 | CSP requires `unsafe-inline` scripts (Next.js hydration) | Info (accepted) | `next.config.ts` | Reduced XSS mitigation | Documented; no other inline sources allowed | Header inspection |

## Explicitly checked and found sound

- SQL injection: all DB access parameterized (pg parameterized queries; better-sqlite3 prepared statements). No string-built SQL with user input.
- Secrets: `.env` gitignored; secret scan across repo clean; no `NEXT_PUBLIC_` exposure of secrets; production bundle inspected.
- Webhook spoofing: ZBD webhook verifies the charge by polling the provider with the server's key (no unsigned callback trust); fulfillment idempotent.
- Prompt injection: external news/market content is delimited as untrusted data in prompts; AI output is parsed/validated, never executed.
- Authorization: every gated route validates the code server-side; federation push/pull validate + rate-limit; research runs keyed by code hash (no cross-user reads).
- Trading: none exists — the product is analysis-only (no order placement anywhere in the codebase). The old paper-trading engine was fully removed.
