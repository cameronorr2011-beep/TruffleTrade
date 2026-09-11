#!/usr/bin/env node
/**
 * TruffleTrade MCP server.
 * Exposes the desk to any MCP client (Claude Desktop, etc.):
 *   - get_desk_status   : account, position, stats
 *   - get_btc_features  : live indicator pack
 *   - get_trade_log     : recent fills with P&L
 *   - get_last_council  : full transcript of the latest council session
 *   - run_cycle_once    : trigger one audited council cycle (DANGEROUS)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { z } from "zod";
import { assertConfig, config } from "../core/config";
import { deskSnapshot, lastCouncil } from "../src/lib/desk";
import { marketSnapshot } from "../core/market";
import { cycleOnce, makeBroker } from "../core/engine-core";
import { recentTrades } from "../core/ledger";

const server = new McpServer({
  name: "truffletrade",
  version: "1.0.0",
});

server.tool("get_desk_status", "Account equity, cash, position, P&L stats and mode for the TruffleTrade desk", {}, async () => {
  assertConfig();
  const snap = await deskSnapshot();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            mode: snap.mode,
            btcPrice: snap.btcPrice,
            priceSource: snap.priceSource,
            account: snap.account,
            stats: snap.stats,
            cycleSeconds: snap.cycleSeconds,
          },
          null,
          2,
        ),
      },
    ],
  };
});

server.tool("get_btc_features", "Live BTC indicator pack: RSI, MACD, ATR, Bollinger, Donchian, returns, macro", {}, async () => {
  assertConfig();
  const snap = await marketSnapshot();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ts: snap.ts,
            price: snap.btcPrice,
            features: snap.featurePack,
            realizedVol1hPct: snap.realizedVol1hPct,
            realizedVol1dPct: snap.realizedVol1dPct,
            macro: snap.macro,
            sources: snap.sources,
          },
          null,
          2,
        ),
      },
    ],
  };
});

server.tool("get_trade_log", "Recent fills with realized P&L from the ledger", { limit: z.number().int().min(1).max(100).default(20) }, async ({ limit }) => {
  assertConfig();
  return { content: [{ type: "text", text: JSON.stringify(recentTrades(limit), null, 2) }] };
});

server.tool("get_last_council", "Full transcript of the most recent council session: every vote and the red-team verdict", {}, async () => {
  assertConfig();
  const c = lastCouncil();
  return { content: [{ type: "text", text: c ? JSON.stringify(c, null, 2) : "No council session has run yet." }] };
});

server.tool(
  "run_cycle_once",
  "Trigger one full audited council cycle (market snapshot, debate, red team, risk checks, possible execution). This can place real trades if BROKER_MODE=kraken.",
  { confirm: z.literal("yes").describe('Must be exactly "yes" to run') },
  async ({ confirm }) => {
    assertConfig();
    if (confirm !== "yes") {
      return { content: [{ type: "text", text: "Refused: pass confirm=\"yes\" to run a cycle." }] };
    }
    const result = await cycleOnce(makeBroker());
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  console.error(`[truffletrade-mcp] ready (mode=${config.brokerMode}, model=${config.groqModel})`);
}

main().catch((err) => {
  console.error(`[truffletrade-mcp] fatal: ${err.message}`);
  process.exit(1);
});
