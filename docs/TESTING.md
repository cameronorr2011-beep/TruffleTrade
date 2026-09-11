# TESTING — TruffleTrade

Run: `npm test` (vitest). Typecheck: `npx tsc --noEmit`. Build: `npm run build`.

## Suite map (17 files, 142 tests at time of writing)

| File | Covers |
|---|---|
| tests/paper-engine.test.ts | Fill pricing (fee/slippage), NaN exclusion, cash checks, limit rules, avg-cost blending, realized P/L, oversell block, mark-to-market with missing marks, all risk gates (position cap, exposure cap, order cap, data-quality, kill-switch w/ de-risk sells, concentration warnings) |
| tests/paper-store.test.ts | Account idempotency, per-owner isolation, peak ratchet, order/insert/status, cross-account read denial, CHECK constraints, position flat-deletion, append-only audit with hashed actors |
| tests/fulfillment.test.ts | Payment idempotency (single issuance on repeat), unpaid stays pending, unknown order throws; ZBD mocked |
| tests/licensing.test.ts + licensing-store.test.ts | Code format/HMAC verification, tamper rejection, order/code lifecycle, expiry/revocation |
| tests/valuation.test.ts | DCF / reverse-DCF / comps determinism |
| tests/indicators.test.ts + research-indicators.test.ts | Technical indicators vs hand-computed fixtures |
| tests/factcheck.test.ts | Numeric claim verification statuses; no silent upgrade of unverified claims |
| tests/consensus.test.ts | Evidence-weighted synthesis; fail-closed red team |
| tests/aisafety.test.ts | Prompt-injection guardrails; structured output rejection |
| tests/aiprovider.test.ts | Groq retry on 429 (retry-after honored), 5xx backoff, give-up (regression: free-tier TPM kills) |
| tests/memory-*.test.ts, twin | Episodic store, consolidation, twin training determinism (seeded), federation tally |
| tests/risk.test.ts | Pre-existing portfolio risk functions |
| tests/tally.test.ts, dex.test.ts | Federation aggregation; DEX/BTC infra |

## Property/invariant coverage actually enforced

- Portfolio value cannot become NaN (engine throws; tested).
- Negative quantities impossible: schema CHECK + engine checks + long-only book (tested).
- Cash accounting consistency: buy cost = notional + fee tested to 1e-6.
- Duplicate payment cannot create duplicate license (fulfillment idempotency, tested).
- Unverified claim cannot become VERIFIED without evidence (factcheck tests).
- Cross-user read denial (paper store isolation tests).

## Not yet automated (honest gaps)

- E2E browser run in CI (browser-automation used interactively; Playwright CI job is a follow-up).
- Electron packaging smoke in CI (manual: `npm run app:dist`).
- Live restore drill for Neon (documented, not executed).
- Load/soak testing of the gateway.
