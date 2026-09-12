# THREAT MODEL — TruffleTrade

Scope: the hosted gateway (Vercel + Neon), the downloadable client (Next app /
Electron), and the federation path. Likelihood: L(low) M(med) H(high) based on
exposure; residual risk stated honestly.

| Threat | L | I | Mitigation (in code) | Residual risk |
|---|---|---|---|---|
| Client compromise (subscriber device) | M | M | Secrets never ship to clients; access code is a bearer token scoped to one hash; revocation kills it centrally | Local SQLite (research/memory state on device) is readable by whoever controls the device |
| Malicious user extracting AI value without paying | H | M | All AI-burning routes behind guard (verified 401); per-code rate limits; router per-minute budget | A paying user can share their code; mitigated by revoke + rate limits, not eliminated |
| Stolen access code | M | M | Codes hashed; revocation endpoint; expiry (30d); admin audit | Until revoked, attacker consumes the subscription |
| API abuse / scripted scraping of free data | H | L | Free endpoints are keyless Yahoo proxies with caching; bounded payloads | Cost is nil (keyless); abuse adds latency only |
| Database compromise (Neon) | L | H | Codes stored hashed; orders store code plaintext ONLY tied to one order for retrieval; no card/PII data stored | No paper portfolios exist (module removed); no real-money impact by design |
| Payment webhook spoofing | M | M | ZBD charges verified server-side by polling the authoritative charge API (no blind trust of callbacks); manual WoS requires operator verification | Operator mistake in manual flow |
| Duplicate fulfillment | M | M | Idempotent fulfillment keyed on order state + charge id; tested (tests/fulfillment.test.ts) | — |
| Federated poisoning (bad aggregate corrupts clients) | M | M | Updates validated (schema + shape), hashed subjects only, opt-in, kill switch via env, prune endpoint; bad batch rejected not merged | A Sybil set of codes could skew weights; impact is prior-weight drift, not data loss |
| Prompt injection via news/market content | M | M | Feed content delimited as untrusted data; agents instructed to treat it as data; no tool/action execution from prompt content; risk engine deterministic and outside AI reach | Persuasion-level effects only (e.g., biased narrative) |
| Malicious dependency (supply chain) | L | H | `npm audit --omit=dev` gate in CI (high+); lockfile committed; install scripts reviewed | npm-wide compromise out of scope; no SBOM yet |
| Admin API brute force | M | M | Disabled unless ADMIN_TOKEN set; constant-compare on token; audited failures | Long/unique token required (operator duty) |
| Data leakage in logs | M | M | Structured logger forbids secret fields; audit trail stores hashes only | Local console logs may contain tickers analyzed |
| Cross-user isolation failure | L | M | All per-user state (research, memory, licensing) keyed by access-code hash at query level; no cross-user read path exists | True multi-tenant accounts NOT implemented (single-operator-per-code model) |

Out of scope: browser zero-days, Vercel/Neon internal compromise, physical device theft
beyond what is stated, regulatory/licensing risk (see terms).
