# Security — TruffleTrade

## Supported versions

Only the latest `main` branch receives security fixes. The deployed production site (Vercel) tracks `main`.

## Security architecture (how access actually works)

- **Access codes are the subscription.** A purchase (Lightning, 1,000 sats) is verified server-side against the payment provider before a code is issued. Codes are `TT-XXXX-XXXX-XXXX-XXXX`: 12 chars of crypto-random Crockford base32 (~60 bits) plus a 4-char HMAC checksum keyed by `LICENSE_HMAC_KEY`. Codes are stored **hashed only** (HMAC-SHA256) — the plaintext exists at issue time and on the buyer's order record so it can be re-delivered to the buyer.
- **Every AI-burning endpoint is gated server-side** (`src/lib/guard.ts`): checksum → DB lookup (active / not expired / not revoked) → per-code rate limit. Expired subscriptions get HTTP 402; revoked get 403. Live market *data* (keyless public feeds) is free by design; *intelligence* (AI analysis, research runs, digital twin, federation) is metered.
- **Federation endpoints require a valid code** and exchange only privacy-preserving aggregates — never raw research, identities, or portfolio contents.
- **Secrets never reach the client.** `GROQ_API_KEY`, `DATABASE_URL`, `LICENSE_HMAC_KEY`, `ADMIN_TOKEN`, ZBD credentials live in server-side env only. The downloadable app ships with **no keys**; it authenticates with the subscriber's own access code.
- **Payments** are verified with the provider (ZBD charge status) — client-reported payment status is never trusted. Fulfillment is idempotent: repeated webhooks cannot issue a second code for the same order.
- **Rate limiting**: per-code sliding window on all gated routes; per-IP window on code verification (brute-force resistance).
- **Brute-force lockout (persistent)**: every rejected code attempt (malformed or unknown) is recorded per-IP in the licensing store (`tt_auth_failures` — Postgres/Neon in production, SQLite locally). After 10 failures inside a rolling 15-minute window the IP is denied on ALL guarded routes (`LOCKED_OUT`, HTTP 429) until the window clears — it survives redeploys because the counter lives in the database, not memory. Failures of *real* codes (expired/revoked) are deliberately not counted, so subscribers can never lock themselves out.

## Reporting a vulnerability

Email the operator via the contact listed on the site, or open a GitHub security advisory (Security tab → "Report a vulnerability"). Please do not open public issues for vulnerabilities.

We aim to acknowledge reports within 72 hours and will credit reporters who wish to be named.

## Deployment security requirements

- Set all secrets via the platform's environment storage (Vercel env vars / local `.env`, which is gitignored).
- `LICENSE_HMAC_KEY` must be a long random string; rotating it invalidates the checksum of all existing codes (codes remain valid in the DB but format verification fails) — plan rotations with a migration.
- Rotate `GROQ_API_KEY` and `ADMIN_TOKEN` immediately if they ever appear in any log or client bundle.

## Known limitations

- Rate-limit buckets are in-memory per server instance (resets on deploy). Sufficient for abuse control; a multi-instance deployment should move to a shared store.
- Access codes live in the subscriber's `localStorage` (the app is a local research terminal; there are no server-side user sessions). This is documented and deliberate: a leaked code can be revoked from the admin API.
- The CSP allows `unsafe-inline` scripts because Next.js hydration requires it.
