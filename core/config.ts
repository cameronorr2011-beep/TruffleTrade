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
  cycleSeconds: num("CYCLE_SECONDS", 300),
  brokerMode: str("BROKER_MODE", "paper") === "kraken" ? "kraken" as const : "paper" as const,
  paperStartUsd: num("PAPER_START_USD", 10_000),
  paperFeeBps: num("PAPER_FEE_BPS", 60),
  paperSlippageBps: num("PAPER_SLIPPAGE_BPS", 8),
  sqlitePath: path.resolve(root, str("SQLITE_PATH", "data/wolfpit.sqlite3")),
  kraken: {
    apiKey: process.env.KRAKEN_API_KEY?.trim() ?? "",
    apiSecret: process.env.KRAKEN_API_SECRET?.trim() ?? "",
    maxExposureUsd: num("KRAKEN_MAX_EXPOSURE_USD", 500),
  },
  killSwitchDd: num("KILL_SWITCH_DD", 0.15),
};

export function assertConfig(): void {
  if (!config.groqApiKey) {
    throw new Error("GROQ_API_KEY is required. Copy .env.example to .env and set it.");
  }
  if (config.brokerMode === "kraken" && (!config.kraken.apiKey || !config.kraken.apiSecret)) {
    throw new Error("BROKER_MODE=kraken requires KRAKEN_API_KEY and KRAKEN_API_SECRET.");
  }
  if (!fs.existsSync(path.dirname(config.sqlitePath))) {
    fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
  }
}
