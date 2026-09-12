# SECURITY — TruffleTrade

Status: describes the implementation as it exists (verified 2026-09-11).

## Secret handling

| Secret | Where it lives | Never appears in |
|---|---|---|
| `GROQ_API_KEY` | Vercel encrypted env (prod), local `.env` (operator) | repo, client bundles, responses |
| `DATABASE_URL` (Neon) | Vercel encrypted env, local `.env` | repo, client, `/api/*` responses |
| `ADMIN_TOKEN` | Vercel env, local `.env` | repo; admin API disabled when unset |
| `LICENSE_HMAC_KEY` | Vercel env, local `.env` | repo; required to mint/verify codes |
| `ZBD_API_KEY` | Vercel env when configured | repo; absence falls back to manual WoS approval |
| Access codes | hashed (SHA-256 + HMAC checksum) in `tt_codes` | audit trail, federation batches, logs |

Verification: `git grep` for credential-shaped patterns across tracked files is clean
(CI runs the same scan: `.github/workflows/ci.yml` "secret scan" step).
Build output (`.next`) is not committed; `next build` inlines only `NEXT_PUBLIC_*`.

## Authorization model

- **AI-burning routes** (`/api/research`, `/api/cycle`, `/api/halt`, watchlist mutations,
  `/api/gateway/*`, `/api/alerts`): guarded by `src/lib/guard.ts` —
  operator token (`DASHBOARD_TOKEN` + `x-desk-token`) OR valid unexpired access code
  (`x-access-code` header or server-side `TT_ACCESS_CODE`). Anonymous → 401.
  Verified live: anonymous POST /api/research → 401 (Vercel,
  where TT_ACCESS_CODE is not set).
- **Admin API** (`/api/admin`): requires `x-admin-token` === `ADMIN_TOKEN`; disabled when unset.
- **Health** (`/api/health`): admin token or valid access code; reports component status only.
- **Audit isolation**: the append-only audit trail stores only hashed actors
  (`core/audit.ts`) — never raw access codes, emails, or payment details.

## Input validation & error hygiene

- Order bodies validated with zod (`.strict()`), bounded sizes; tickers regex-checked.
- External data (Yahoo/News) is schema-shaped in `core/research/providers.ts`; failures
  return null/throw → callers surface explicit unavailable states. No data is invented.
- AI outputs are schema-validated (`chatJson`), malformed output rejected; red-team
  unreachable ⇒ no thesis (fail closed).
- Production API errors return generic messages; stack traces stay in server logs.

## Prompt-injection stance

News/market content is treated as data, delimited inside user prompts; system prompts
instruct agents to treat feed content as untrusted. No tool execution path exists from
prompt content; alert rules are deterministic code and cannot be influenced by AI output.
