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

## No KYC, honestly

- **Market data:** keyless public APIs (Kraken, Coinbase Exchange, Yahoo Finance). No signup.
- **Paper mode (default):** simulated fills with realistic fees/slippage. Nothing to sign up for.
- **Degen Mode (real money, no KYC):** WOLFPIT trades **from your own wallet** — USDC ⇄ cbBTC swaps on Base (Coinbase's L2) via Uniswap V3. There is no exchange account, so there is no identity verification. Self-custody is legal in California and everywhere in the US. The cbBTC is yours, in your wallet, always.
- **Kraken live mode (requires KYC in the US):** every regulated US exchange must verify identity by federal law (Bank Secrecy Act / FinCEN) — Kraken US requires SSN/ITIN + government ID. Use this only if you already have a verified account. Offshore "no-KYC" exchanges that accept US users are operating outside US law — WOLFPIT does not integrate them.
- **Taxes are not optional:** swaps are taxable events in the US even on-chain. The SQLite ledger records every fill with its tx hash, so your records keep themselves.

## Degen Mode — real on-chain trading (no KYC, self-custody)

```
WALLET (yours, dedicated to WOLFPIT)
  └─ USDC on Base  ──Uniswap V3 (SwapRouter02)──▶  cbBTC in YOUR wallet
  └─ ~0.001 ETH for L2 gas (pennies per swap)
```

Setup, in order:

1. **Create a dedicated hot wallet** for WOLFPIT only — never the wallet holding your savings. (Rabby, MetaMask, or generate offline.) Export its private key.
2. **Fund it small**: buy USDC on any on-ramp app (e.g. Coinbase, where SEPA/ACH funding is verified once by the *on-ramp*, not by WOLFPIT), withdraw to Base, plus ~0.001 ETH on Base for gas. Withdrawals to Base are cheap.
3. `.env`:

   ```
   BROKER_MODE=onchain
   ONCHAIN_TRADING=1
   ONCHAIN_PRIVATE_KEY=0xyourkey
   WOLF_MAX_USD_PER_TRADE=25      # start small. like, really small
   WOLF_MAX_TOTAL_USD=50
   WOLF_SLIPPAGE_BPS=100          # 1% guard — swaps revert beyond this
   ```

4. `npm run engine:once` — watch it: council → red team → risk caps → **real swap** with the tx hash in the blotter.

What WOLFPIT refuses to do, in code: exceed the per-trade cap, exceed the total cap, trade with <0.0005 ETH gas, swap without a slippage bound, grant unlimited token approvals (exact-amount approvals only), or execute if the red team says no.

Contract addresses (verified on-chain and against Basescan): SwapRouter02 `0x2626664c2603336E57B271c5C0b26F421741e481`, cbBTC `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf`, USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.

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

## Going live — read this twice

- **No-KYC real trading (Degen Mode):** follow the section above. Dedicated wallet, small caps, `BROKER_MODE=onchain` + `ONCHAIN_TRADING=1`.
- **Kraken (only if you already have a verified account):** API key with *only* "Create & Modify Orders", `BROKER_MODE=kraken`, and a `KRAKEN_MAX_EXPOSURE_USD` you can lose without flinching. Never enable withdrawals on the key.
- **Never** put a wallet key with significant funds into `.env`. This is a hot wallet for a robot. Treat it like cash in a glovebox.

**This is open-source software, not investment advice.** Autonomous trading loses money — Degen Mode loses *real* money. The kill switch (`KILL_SWITCH_DD`, default 15%), per-trade caps, total cap, and slippage guard are seatbelts, not guarantees. You are responsible for your keys, capital, taxes, and local regulations.

## Architecture

```
core/            domain: market data, indicators, council brain, risk, brokers, ledger
  brain.ts         Groq (gpt-oss-120b) — 5 specialist votes + red-team gate, JSON mode
  tally.ts         pure conviction-weighted vote tally (unit-tested)
  risk.ts          deterministic sizing/stops/kill-switch (unit-tested, overrides AI)
  market.ts        Kraken → Coinbase failover, Yahoo macro, feature engineering
  broker.ts        broker interface + paper broker (fees + slippage)
  kraken.ts        live broker: HMAC-SHA512 signed, exposure-capped (KYC exchange)
  dex.ts           Degen Mode: real USDC⇄cbBTC swaps on Base via Uniswap V3, self-custody, no KYC
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
