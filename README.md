# WOLFPIT 🐺

**The autonomous BTC trading desk with a council of rivals.**

Five AI trading agents with opposing mandates debate every Bitcoin trade. A sixth — the red team — tries to tear each proposal apart. Only ideas that survive a hostile committee get sized and executed. Every vote, objection, and fill is persisted to an open SQLite ledger you can query yourself.

Hedge funds are monoliths: one model, one opinion, one blind spot. WOLFPIT is adversarial by design.

```
 ┌────────── INGEST ──────────┐   BTC 1h/1d candles — Kraken (Coinbase fallback)
 │  keyless, no accounts      │   SPY / VIXY / DXY regime — Yahoo Finance
 └─────────────┬──────────────┘
               ▼
 ┌────────── DEBATE ──────────┐   MOMENTUM (trend) · REVERSION (fade)
 │  five rivals, one seat     │   MACRO (regime) · FLOW (volume) · SENTINEL (risk)
 │  each with veto-by-weight  │   each votes buy/hold/sell + confidence + rationale
 └─────────────┬──────────────┘
               ▼
 ┌────────── ATTACK ──────────┐   RED TEAM cross-examines the winning case.
 │  fail-closed               │   No approval → no trade. Unreachable → no trade.
 └─────────────┬──────────────┘
               ▼
 ┌────────── SIZE & EXECUTE ──┐   1% equity risk per trade · 2×ATR stop
 │  deterministic code        │   3×ATR target · 96h time stop · no pyramiding
 │  the AI cannot override    │   kill switch: -15% from peak equity → flat & halt
 └─────────────┬──────────────┘
               ▼
        SQLITE LEDGER          trades · cycles · equity · full council transcripts
```

## The novel idea (vs. a hedge fund)

| Hedge fund | WOLFPIT |
|---|---|
| One model, one opinion | Five rivals with opposing mandates |
| Black-box risk committee | Red team whose objections you can read |
| "Proprietary" reasoning | Full transcript of every debate, forever |
| You trust the brand | You audit the SQLite ledger yourself |
| Fees for the privilege | Open source; you bring your own keys |

The edge isn't a magic signal — it's that a trade must be argued for, attacked, and defended *on the record* before it exists.

## No KYC, by architecture

- **Market data:** keyless public APIs (Kraken, Coinbase Exchange, Yahoo Finance). No signup.
- **Paper mode (default):** simulated fills with realistic fees/slippage. Nothing to sign up for.
- **Live mode (optional):** your own Kraken API key with only *"Create & Modify Orders"* enabled. Kraken crypto-only accounts require no identity verification. **Never enable withdrawals on the key.** Exposure is hard-capped by `KRAKEN_MAX_EXPOSURE_USD` in code.

## Quickstart

```bash
npm install
cp .env.example .env          # set GROQ_API_KEY (that's the only required secret)
npm run db:migrate            # create the ledger
npm run engine:once           # one council cycle, end to end
npm run dev                   # the website on http://localhost:3210
```

Open `/desk` for the live desk: equity, position, last council transcript, blotter, kill switch, and a "run one cycle now" button.

Continuous desk:

```bash
npm run engine                # cycles every CYCLE_SECONDS (default 300s)
```

### MCP server (Claude Desktop / any MCP client)

```json
{
  "mcpServers": {
    "wolfpit": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/ai-stock-trader/mcp/server.ts"],
      "env": { "GROQ_API_KEY": "gsk_...", "SQLITE_PATH": "/absolute/path/to/ai-stock-trader/data/wolfpit.sqlite3" }
    }
  }
}
```

Tools: `get_desk_status`, `get_btc_features`, `get_trade_log`, `get_last_council`, `run_cycle_once` (requires `confirm: "yes"`).

## Going live (no KYC) — read this twice

1. Kraken → Settings → API → **Create key** with *only* "Create & Modify Orders".
2. `.env`: `BROKER_MODE=kraken`, paste `KRAKEN_API_KEY` / `KRAKEN_API_SECRET`.
3. Set `KRAKEN_MAX_EXPOSURE_USD` to money you can lose without flinching. The engine refuses to exceed it.
4. `npm run engine:once` and read the council transcript before letting it loop.

**This is open-source software, not investment advice.** Autonomous trading loses money. The kill switch (`KILL_SWITCH_DD`, default 15%) and exposure cap are seatbelts, not guarantees. You are responsible for your keys, capital, and local regulations.

## Architecture

```
core/            domain: market data, indicators, council brain, risk, brokers, ledger
  brain.ts         Groq (gpt-oss-120b) — 5 specialist votes + red-team gate, JSON mode
  tally.ts         pure conviction-weighted vote tally (unit-tested)
  risk.ts          deterministic sizing/stops/kill-switch (unit-tested, overrides AI)
  market.ts        Kraken → Coinbase failover, Yahoo macro, feature engineering
  broker.ts        paper broker (fees + slippage)
  kraken.ts        live broker: HMAC-SHA512 signed, exposure-capped
  ledger.ts        SQLite: trades, cycles, equity, persisted account state
engine/          autonomous loop (own process, own schedule)
mcp/             Model Context Protocol server
src/app          Next.js 16 site: landing + /desk dashboard + control API
tests/           vitest: tally, indicators, risk
```

## Configuration

See [.env.example](.env.example). Notables: `CYCLE_SECONDS`, `BROKER_MODE` (`paper`|`kraken`), `PAPER_FEE_BPS` (Kraken taker ≈ 60bps assumed), `KILL_SWITCH_DD`, `DASHBOARD_TOKEN` (optional; protects `/api/cycle` and `/api/halt` when the site is public).

## Development

```bash
npm run typecheck && npm run test && npm run build
```

MIT licensed. Trade like you're accountable — because here, you can see exactly who voted what.
