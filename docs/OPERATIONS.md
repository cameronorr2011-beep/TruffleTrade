# OPERATIONS — TruffleTrade

## Environments

| | Local (subscriber desktop) | Production (Vercel) |
|---|---|---|
| App | `npm run dev` / Electron (`npm run app`) | ai-stock-trader-two.vercel.app |
| Licensing/paper DB | SQLite (`data/truffletrade.sqlite3`) | Neon Postgres (`DATABASE_URL`) |
| Research runs | SQLite (local history) | returned to client; serverless FS is read-only (known limitation, PRODUCTION-AUDIT §3a) |
| Secrets | `.env` (gitignored) | Vercel encrypted env |

## Required environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | prod only | Neon Postgres (licenses, payments, federation, paper trading) |
| `LICENSE_HMAC_KEY` | prod | mint/verify access codes |
| `GROQ_API_KEY` | operator only | server-side AI gateway |
| `GROQ_MODEL` | optional | council reasoning model override |
| `ADMIN_TOKEN` | recommended | enables `/api/admin` |
| `ZBD_API_KEY` | optional | automated Lightning checkout; manual WoS fallback when absent |
| `TT_SITE_URL` | prod | absolute URL for webhooks/callbacks |
| `TT_GATEWAY_URL` | subscriber install | points the local app at the hosted gateway |
| `TT_ACCESS_CODE` | subscriber install | the subscriber's paid access code |

Production fail-fast: gateway + guard reject requests when the code/DB check fails;
admin API is disabled (401) when `ADMIN_TOKEN` is unset.

## Deployment

1. Push to `main` → Vercel builds (GitHub integration). CI (typecheck, tests, build,
   secret scan, npm audit) gates PRs; `main` deploys after the same checks run locally.
2. Env vars are set in the Vercel dashboard or via `scripts/vercel-set-env.mjs`
   (`VT=<token> node scripts/vercel-set-env.mjs` — never prints values, only fingerprints).
   `ZBD_API_KEY` is intentionally excluded from that script.

## Database operations

- Schema is created idempotently on first connection (both SQLite and Postgres)
  by `core/licensing/db.ts` and `core/paper/db.ts`; `scripts/migrate.ts` prints table state.
- Migrations are additive `CREATE TABLE IF NOT EXISTS` statements — no destructive
  changes exist. Any future destructive change requires a written migration plan first.

## Backups (Neon)

- Point-in-time restore is available in the Neon console (retention per plan).
- Restore drill: NOT yet executed — tracked as UNVERIFIED in PRODUCTION-ACCEPTANCE.md.
- Local SQLite: users back up `data/truffletrade.sqlite3` by file copy while the app is closed.

## Payments operations (manual WoS fallback)

1. Buyer sends 1,000 sats to the operator's Wallet of Satoshi address shown on /buy.
2. Operator verifies receipt in the WoS app, then approves via admin:
   `POST /api/admin` is NOT for fulfillment — fulfillment happens by marking the
   order paid in the DB (`tt_orders.status='paid'`) or re-running the status
   endpoint after a ZBD charge exists. Orders created via the manual flow carry
   `wos-manual-*` charge ids and are approved by the operator issuing a comped
   or matched code through `/api/admin` `issue`/`extend`.
3. Every issuance/extension/revocation writes an audit event (`tt_audit_events`).

## Rollback

Vercel → Deployments → previous deployment → "Promote to Production" (instant).
DB rollback: additive schema means old code runs against new tables; data written
by newer code (paper tables) is ignored harmlessly by older code.

## Known operational limits

- Research run history does not persist on Vercel (read-only FS) — documented.
- Federation aggregation on Vercel is stateless-per-request; batches live in Neon.
- The Electron app spawns `next start` locally; the packaged installer bundles it.
