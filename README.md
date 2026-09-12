# TruffleTrade 🍄📈

**AI stock-chart intelligence with a memory that trains itself.**

TruffleTrade points six rival AI analysts, a fact-checker, and a red team at any stock chart — then remembers what it learned. It does **not** trade for you: it makes sure you've seen every side of the argument before you click the button yourself.

```
 ┌────────── INGEST ──────────┐   candles · fundamentals · headlines · macro
 │  keyless, no accounts      │   honest DATA UNAVAILABLE when sources are gated
 └─────────────┬──────────────┘
               ▼
 ┌────────── MODEL ───────────┐   DCF · reverse-DCF · comps · indicators
 │  deterministic code        │   every assumption exposed, sensitivity grids
 └─────────────┬──────────────┘
               ▼
 ┌────────── DEBATE ──────────┐   FUNDAMENTALS · VALUATION · TECHNICALS
 │  six rival analysts        │   MACRO · COMPETITION · NEWS
 │  stance + confidence each  │   every number fact-checked against the data
 └─────────────┬──────────────┘
               ▼
 ┌────────── ATTACK ──────────┐   RED TEAM cross-examines the consensus.
 │  fail-closed               │   Thin evidence → REJECT. No thesis issued.
 └─────────────┬──────────────┘
               ▼
 ┌────────── REMEMBER ────────┐   episodic memory on YOUR device
 │  updates automatically     │   digital-twin priors from simulated markets
 │  federated, no leaks       │   hashed-subject sync across all installs
 └────────────────────────────┘
```

## The product

- **The analysis engine** (this repo, open source, MIT): the six-analyst council, deterministic valuation, fact-checker, fail-closed red team, versioned theses, forecast audit, the BTC analysis desk, and the memory system.
- **The gateway** (deployed on Vercel by the operator): the only component holding AI credentials. Subscribers authenticate with an access code; the gateway validates subscriptions, rate-limits, and forwards to Groq. **The downloadable app contains no API keys — by design.**
- **The website** (also this repo, deployed on Vercel): the product page at `/`, purchase via Lightning at `/buy`, install guide at `/install`, blog, privacy policy, and terms.

## No KYC, honestly

- **No accounts.** Pay 1,000 sats over Lightning (via ZBD), get an access code, run the app.
- **No identity anywhere.** We never collect name, email, or documents. Codes are stored hashed.
- **No auto-renew.** 30 days per payment; renewal is a deliberate new payment.
- **18+, or 13–17 with parental consent and supervision** (see `/terms`).
- The BTC desk is analysis-first by design: the five-voter council reads live Kraken/Coinbase data and issues a verdict you can argue with. On-chain Degen Mode remains opt-in, double-locked, and capped — from your own wallet, no exchange account. TruffleTrade never places stock trades.

## Quickstart (subscribers)

```bash
git clone https://github.com/cameronorr2011-beep/TruffleTrade.git truffletrade
cd truffletrade && npm install
cp .env.example .env        # set TT_GATEWAY_URL + TT_ACCESS_CODE
npm run verify              # checks your subscription against the gateway
npm run dev                 # → http://localhost:3210
```

Open `/research`, type a ticker, launch an investigation. The memory updates itself every 6 hours; run `npm run memory:update` to also train the digital twin and sync federated learning.

## Deploying the gateway + website (operator)

1. Push this repo to GitHub; import it into Vercel (framework auto-detected: Next.js).
2. Set env vars in Vercel (**never** commit these):
   - `GROQ_API_KEY` — the AI credential, server-side only
   - `GROQ_MODEL` — `openai/gpt-oss-120b` (most capable production model on Groq)
   - `ZBD_API_KEY` — Lightning payments
   - `LICENSE_HMAC_KEY`, `ADMIN_TOKEN` — `openssl rand -hex 32`
   - `DATABASE_URL` — Postgres (e.g. Neon) for the licensing store
   - `TT_SITE_URL` — your production URL (webhook target)
3. In the ZBD dashboard, payment callbacks point at `https://<your-site>/api/billing/zbd-webhook`.
4. `npm run db:migrate` locally once against `DATABASE_URL` to verify the schema.

Users then "install via GitHub": clone, add access code, done — no keys, no build secrets.

## Architecture

```
core/               domain
  brain.ts            BTC desk council (5 voters + red team)
  risk.ts             deterministic sizing/stops/kill-switch (overrides AI)
  market.ts           Kraken/Coinbase/Yahoo feeds
  ledger.ts           SQLite ledger
  licensing/          THE BUSINESS LAYER
    codes.ts            TT-XXXX-… access codes (HMAC checksum, hashed storage)
    zbd.ts              ZBD Lightning charges (create/poll, msats)
    db.ts               orders/codes/federation store (SQLite + Postgres)
    fulfill.ts          idempotent payment → 30-day code issuance
    validate.ts         subscription validation + per-code rate limiting
  memory/             THE MEMORY SYSTEM
    memory.ts           episodic facts: ingest, recall, consolidate, export
    twin.ts             digital-twin trainer (GBM + block-bootstrap, seeded)
    federated.ts        privacy-preserving push/pull sync client
    updater.ts          the 6-hour auto-update loop + CLI
  data/               THE NO-KYC DATA LAYER
    plugins.ts          provider registry: kraken · yahoo · stooq · gnews
                        keyless, provenance-stamped, fail-closed failover
  alerts.ts           deterministic alert rules + upcoming-event radar
  research/           THE ANALYSIS PLATFORM
    providers.ts        keyless Yahoo + Google News
    datapack.ts         provenance-backed data assembly
    valuation.ts        DCF / reverse-DCF / comps, assumptions exposed
    factcheck.ts        numeric-claim verification, violation stripping
    agents.ts           6-agent council + fail-closed red team
    thesis.ts           cases, invalidation conditions, scenarios
    engine.ts           orchestration for one full run
    store.ts            runs, theses, forecasts, watchlist (SQLite)
    ai.ts               model router: GatewayProvider (subscribers) | Groq (operator)
src/app             Next.js 16: product site + local analysis app
  page.tsx            product landing
  buy/                Lightning checkout (ZBD charge → code issuance)
  install/            GitHub install guide
  blog/               system deep-dives
  privacy/ /terms/    legal (18+ / parental consent, no-KYC disclosures)
  api/billing/        checkout, ZBD webhook, status
  api/gateway/        AI proxy (the only path to GROQ_API_KEY), verify
  api/federation/     push/pull aggregated memory updates
  api/admin/          extend/revoke/comp codes (x-admin-token)
  research/ desk/ …   the local analysis app itself
tests/              vitest: tally, risk, valuation, factcheck, licensing, memory, twin
```

### The invariants (unchanged, still tested)

1. **The AI never invents numbers** — every claim is extracted and verified; violations are stripped.
2. **Fail-closed everywhere** — unreachable red team ⇒ no thesis; unreachable ZBD ⇒ no fulfillment.
3. **Consensus is not vote-counting** — evidence-weighted synthesis.
4. **Honest unavailability** — missing data renders DATA UNAVAILABLE, never estimated.
5. **No keys in the client** — the app talks to the gateway; `GROQ_API_KEY` exists only server-side.
6. **Memory exports are privacy-preserving** — hashed subjects and counts, never content.

## Development

```bash
npm run typecheck && npm test && npm run build
```

MIT licensed — see [LICENSE](LICENSE). TruffleTrade is analysis software, not investment advice. You are responsible for your capital, your taxes, and your jurisdiction's rules.
