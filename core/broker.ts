import type { CouncilDecision, MarketSnapshot } from "./types";
import { config } from "./config";

export interface Fill {
  side: "buy" | "sell";
  qtyBtc: number;
  price: number;
  feeUsd: number;
  slippageUsd: number;
  ref: string;
}

export interface Broker {
  readonly mode: "paper" | "kraken" | "onchain";
  marketBuy(qtyBtc: number, ref: string): Promise<Fill>;
  marketSell(qtyBtc: number, ref: string): Promise<Fill>;
}

export class PaperBroker implements Broker {
  readonly mode = "paper" as const;

  async marketBuy(qtyBtc: number, ref: string): Promise<Fill> {
    const { price, source } = await import("./market").then((m) => m.btcPrice());
    const slip = price * (config.paperSlippageBps / 10_000);
    const fillPrice = price + slip;
    const notional = qtyBtc * fillPrice;
    return {
      side: "buy",
      qtyBtc,
      price: Math.round(fillPrice * 100) / 100,
      feeUsd: Math.round(notional * (config.paperFeeBps / 10_000) * 100) / 100,
      slippageUsd: Math.round(slip * qtyBtc * 100) / 100,
      ref: `${ref}@${source}`,
    };
  }

  async marketSell(qtyBtc: number, ref: string): Promise<Fill> {
    const { price, source } = await import("./market").then((m) => m.btcPrice());
    const slip = price * (config.paperSlippageBps / 10_000);
    const fillPrice = price - slip;
    const notional = qtyBtc * fillPrice;
    return {
      side: "sell",
      qtyBtc,
      price: Math.round(fillPrice * 100) / 100,
      feeUsd: Math.round(notional * (config.paperFeeBps / 10_000) * 100) / 100,
      slippageUsd: Math.round(slip * qtyBtc * 100) / 100,
      ref: `${ref}@${source}`,
    };
  }
}
