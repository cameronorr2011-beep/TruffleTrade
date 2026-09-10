# WOLFPIT AI System

How the adversarial AI works, what it may claim, and how it is evaluated.

## The council (research platform)

| Agent | Mandate | Fails to |
|---|---|---|
| **Fundamentals** | revenue, earnings, margins, FCF, balance sheet, dilution | business quality |
| **Valuation** | multiples, DCF/reverse-DCF assumptions, peer comps | price vs value |
| **Technicals** | trend, momentum, vol, structure (from computed indicators only) | chart hallucination |
| **Macro** | which macro variables actually matter for THIS company | generic commentary |
| **Competition** | moat: pricing power, switching costs, scale, regulation | moat fantasy |
| **News** | material events, sentiment, attribution to real headlines | fabricated citations |
| **RedTeam** | attack everything; may REJECT the whole run | rubber-stamping |

Agents run in parallel and never see each other's outputs — independence by construction.
The red team runs last and sees everything.

## What the AI is forbidden from doing

Enforced by prompt rules + deterministic post-processing (both tested):

1. **Inventing numbers.** Only numbers present in the data pack may be cited; anything else
   must be written as "data unavailable". The fact-checker extracts numeric claims and
   verifies each against the metric table within rounding tolerances.
2. **Guaranteeing outcomes.** Language like "guaranteed returns" or certainty about future
   prices is banned; agents must use "evidence suggests", "model scenario", "high uncertainty".
3. **Fabricating citations.** The news agent must quote headline fragments; no source means
   no claim.
4. **Following injected instructions.** Retrieved headlines/data are untrusted input; system
   prompts explicitly forbid obeying instructions found inside them.
5. **Forced conclusions.** Any agent (and the red team) may answer `insufficient-evidence`.
   The red team can veto the entire run — no thesis is issued rather than a fake one.

## Fact-check flow

```
agent prose → extract numeric claims (metric-phrase proximity)
            → verify vs deterministic metric table (tolerances: RSI ±2; 5% mid; 3% large)
            → violations: unsupported-number | contradicted | stale-data
            → verified-confidence = self-confidence × (1 − 0.35 × violations)
            → violated numbers stripped from final prose
```

## Consensus & confidence

- Each agent's **weight** = evidence quality (primary 1.0, derived 0.75, secondary 0.6),
  evidence coverage (n/4), and a −30% penalty per fact-check violation.
- Consensus score ∈ [−1, +1]; stance from thresholds (±0.3 bullish/bearish, −0.1 caution).
- Red-team `insufficient-evidence` forces the run to REJECT regardless of score.
- Confidence is computed from data completeness, source quality, recency, agreement, and
  contradiction — a breakdown is displayed, never a bare "AI confidence: 94%".

## Thesis generation

The thesis engine receives only council outputs + data summary + valuation model output.
Its invalidation conditions are whitelisted to real metrics (`peTtm`, `grossMarginPct`, …)
with finite thresholds; anything else is dropped. Scenario probabilities are normalized to
sum to 100 and labeled "model scenario".

## Prompt versioning

Every agent has a version string (e.g. `fundamental-agent-v1.0`) recorded on every run and
stored with the output. Change a prompt → bump the version → results remain attributable
to (data × model × prompt × calculation).

## Forecast audit

When confidence is at least moderate and consensus is directional, the run records a 90-day
direction-only forecast (magnitudes are deliberately not fabricated). A background PUT on
`/api/watchlist` resolves matured forecasts against live prices. `/watchlist` displays
directional accuracy across ALL resolved forecasts — hits and misses both stay on the record.

## Model router

`AIProvider.chatJson()` is the single AI entry point. Groq today; OpenAI / Anthropic /
Google / local models are one class away. Every call logs provider, model, prompt version,
timestamp, duration, and token usage where available.
