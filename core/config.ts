import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

function num(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : def;
}

function str(name: string, def: string): string {
  return process.env[name]?.trim() || def;
}

const root = process.cwd();

export const config = {
  groqApiKey: process.env.GROQ_API_KEY?.trim() ?? "",
  groqModel: str("GROQ_MODEL", "openai/gpt-oss-120b"),
  // Subscriber gateway (AI calls go through the TruffleTrade gateway; no local key)
  gatewayUrl: str("TT_GATEWAY_URL", ""),
  accessCode: str("TT_ACCESS_CODE", ""),
  siteUrl: str("TT_SITE_URL", ""),
  cycleSeconds: num("CYCLE_SECONDS", 300),
  brokerMode: ((): "paper" | "kraken" | "onchain" => {
    const m = str("BROKER_MODE", "paper");
    if (m === "kraken") return "kraken";
    if (m === "onchain" || m === "degen") return "onchain";
    return "paper";
  })(),
  paperStartUsd: num("PAPER_START_USD", 10_000),
  paperFeeBps: num("PAPER_FEE_BPS", 60),
  paperSlippageBps: num("PAPER_SLIPPAGE_BPS", 8),
  sqlitePath: path.resolve(root, str("SQLITE_PATH", "data/truffletrade.sqlite3")),
  kraken: {
    apiKey: process.env.KRAKEN_API_KEY?.trim() ?? "",
    apiSecret: process.env.KRAKEN_API_SECRET?.trim() ?? "",
    maxExposureUsd: num("KRAKEN_MAX_EXPOSURE_USD", 500),
  },
  onchain: {
    // Degen Mode: REAL on-chain trading, self-custody, no KYC. Double-locked.
    tradingEnabled: str("ONCHAIN_TRADING", "0") === "1",
    privateKey: process.env.ONCHAIN_PRIVATE_KEY?.trim() ?? "",
    rpcUrl: str("BASE_RPC_URL", "https://mainnet.base.org"),
    maxUsdPerTrade: num("WOLF_MAX_USD_PER_TRADE", 50),
    maxTotalUsd: num("WOLF_MAX_TOTAL_USD", 100),
    slippageBps: num("WOLF_SLIPPAGE_BPS", 100),
  },
  killSwitchDd: num("KILL_SWITCH_DD", 0.15),
};

export function assertConfig(): void {
  const hasGateway = Boolean(config.gatewayUrl && config.accessCode);
  if (!hasGateway && !config.groqApiKey) {
    throw new Error(
      "No AI backend configured. Subscribers: set TT_GATEWAY_URL + TT_ACCESS_CODE in .env. Operator: set GROQ_API_KEY.",
    );
  }
  if (config.brokerMode === "kraken" && (!config.kraken.apiKey || !config.kraken.apiSecret)) {
    throw new Error("BROKER_MODE=kraken requires KRAKEN_API_KEY and KRAKEN_API_SECRET.");
  }
  if (config.brokerMode === "onchain") {
    if (!config.onchain.tradingEnabled) {
      throw new Error("BROKER_MODE=onchain also requires ONCHAIN_TRADING=1 (double lock for real-money trading).");
    }
    if (!config.onchain.privateKey) {
      throw new Error("BROKER_MODE=onchain requires ONCHAIN_PRIVATE_KEY (a dedicated hot wallet key).\n" +
        "Create one ONLY for testing with a small amount of USDC + ETH on Base. Never reuse a wallet that holds savings.");
    }
  }
  if (!fs.existsSync(path.dirname(config.sqlitePath))) {
    fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
  }
}
