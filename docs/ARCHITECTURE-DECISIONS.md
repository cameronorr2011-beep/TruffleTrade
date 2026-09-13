# Architecture decisions — TruffleTrade

Every major decision lists the alternatives actually considered and why the
chosen option won on evidence. (Standard: 2–3 viable alternatives per decision,
compared on accuracy, cost, latency, data needs, scalability, failure modes,
interpretability, maintenance.)

## 1. Market data: keyless public Yahoo v8 + Kraken/Stooq plugins vs. paid APIs (Polygon/AlphaVantage) vs. scraping brokers

| | Chosen: keyless plugin registry | Paid market-data APIs | Broker scraping |
|---|---|---|---|
| Accuracy | Good (15-min delayed common) | Best (real-time, adjudicated) | Fragile, ToS-violating |
| Cost | $0 | $29–199+/mo per user — kills a 1,000-sat price | $0 but bans |
| Latency | seconds | ms | seconds + captchas |
| Failure modes | rate-limits, structure changes → explicit UNAVAILABLE | key expiry, billing failure | silent breakage |
| Maintenance | one file per plugin | SDK churn | constant |

**Decision:** keyless plugins with fail-closed normalization. At 1,000 sats/month (~$0.60), paid data APIs are economically impossible per user; delayed-but-honest data with provenance beats real-time-but-unaffordable. The plugin registry (`core/data/plugins.ts`) makes a paid tier a one-entry addition if pricing ever changes.

## 2. Analysis core: deterministic engine + AI interpretation vs. LLM-predicts-everything vs. classical ML (GBT/NN) predictor

| | Chosen: deterministic + AI debate | LLM predicts | Trained ML models |
|---|---|---|---|
| Accuracy | Indicators are exact; AI adds interpretation, not numbers | hallucinates numerics (observed: SMA20=0 vs 220.16) | potentially strong, unproven here |
| Cost | ~7 AI calls/run | same calls, worse output | GPU/training infra |
| Data needs | public candles only | same | years of labeled outcomes + feature pipeline |
| Failure modes | AI down → card downgrades to NO TRADE (fail-closed) | confident nonsense | silent decay, drift |
| Interpretability | every number traceable to source | none | SHAP required |
| Maintenance | low | low | high (retraining, drift) |

**Decision:** deterministic math (SMA/RSI/ATR/DCF/Monte-Carlo twin) computed in tested code; the LLM interprets and cross-examines but may not originate numbers. Fact-checking compares every agent numeric claim to the data pack (the SMA20=0 class of error is caught, shown in the fact-check ledger, and downweights the agent). ML predictors remain an *experiment* in `docs/RESEARCH.md` terms — not shipped without beating simple baselines out-of-sample.

## 3. Digital twin: seeded Monte-Carlo bootstrap of the asset's own history vs. GBM parameter fit vs. deep generative models

| | Chosen: seeded path bootstrap + calibration damping | GBM (μ, σ fit) | VAE/GAN synthetic markets |
|---|---|---|---|
| Accuracy | preserves fat tails/vol clustering of the actual asset | underestimates tails | unvalidatable |
| Cost | ~ms per 800 paths | ms | GPU training + inference |
| Data | 60+ daily closes | 60+ closes | thousands of names × years |
| Failure modes | thin history → "thin" calibration label, confidence damped | wrong distribution, confident | mode collapse |
| Interpretability | replay paths are inspectable | 2 params | none |

**Decision:** block bootstrap of the ticker's own 2-year history with deterministic seeds (reproducible), calibration score from backtested replay accuracy, and explicit HISTORICAL/SIMULATED/SYNTHETIC labeling. Every result is labeled MODEL OUTPUT with the calibration caveat.

## 4. Memory: local SQLite + Neon Postgres gateway vs. cloud-only vs. P2P sync

| | Chosen: local-first + server gateway | Cloud-only | P2P |
|---|---|---|---|
| Latency | local reads are instant | every read is a network hop | N/A |
| Privacy | raw research never leaves the device | all data on server | key mgmt nightmare |
| Federation | aggregates only, opt-in, kill switch | N/A | trust model undefined |
| Failure modes | server down → local still works | server down → nothing | partitions |

**Decision:** subscriber memory lives on their machine (SQLite); the server holds licensing, audit, and privacy-preserving federated aggregates (Neon Postgres). Federation pushes hashed, aggregated updates with replay protection and a kill switch — never raw research.

## 5. Security model: access-code gateway vs. per-user accounts vs. signed license files

| | Chosen: hashed access codes + server guard | Accounts+passwords | License files |
|---|---|---|---|
| Auth strength | 60-bit random + HMAC checksum, timing-safe compare | stronger w/ MFA | forgeable without care |
| KYC/privacy | none — fits the no-KYC product | emails, resets, PII liability | none |
| Abuse control | per-code + per-IP rate limits, revocation, audit log | same | weak |
| Cost/ops | minimal | password storage, reset flows, sessions | distribution tooling |

**Decision:** codes ARE the subscription (hashed at rest, HMAC-keyed checksums, constant-time verification, revocation, per-code rate limits, per-IP brute-force limiting on verify). Documented trade-off: code in localStorage = local-device compromise scope; revocation is the mitigation.

## 6. Result UX: evidence-first integrity UI vs. confidence-score-first vs. chat-first

| | Chosen: integrity header + decision banner + expandable depth | Big confidence % | Chatbot |
|---|---|---|---|
| Trust | status from backend state (veto/coverage/health), refusals visible | implies certainty | slop |
| Failure modes | REJECT is a first-class, well-designed state | failure looks broken | leaks infra errors |
| Cognitive load | progressive disclosure | one misleading number | unbounded |

**Decision:** NO TRADE / RED TEAM REJECT are designed outcomes with equal polish to success. The decision banner states the market decision unambiguously after the evidence; deep detail (drivers, debate, transcripts, prompt versions) is one click away. Confidence is never shown as a probability — it is a 0–100 self-assessment with damped calibration.

## 7. Signal pacing: honest staged pipeline vs. instant response vs. fake progress

**Chosen:** the card genuinely takes ~10s (real provider latency + twin replay) and the staged progress animates through seven real pipeline stages. A minimum-visible-deliberation window (9.5s) lets the narrative complete before the verdict lands. Fake instant answers would undersell real work; fake progress percentages are prohibited — stages map to actual engine stages.

## Remaining experimental items (not shipped as "established")

- Federated model updates: aggregation is weighted-averaging of hashed deltas; ablation studies (does federation improve calibration vs. local-only?) are specified in docs/RESEARCH.md but not yet statistically concluded.
- Analyst-consensus ("street") driver: bounded at weight 0.15 pending its own out-of-sample evaluation; the ablation harness exists (`npm test`, `scripts/verify-prevclose.ts` pattern) for the experiments/ lab next.
