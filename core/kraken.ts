import crypto from "node:crypto";
import { config } from "./config";
import type { Broker, Fill } from "./broker";

const KRAKEN_API = "https://api.kraken.com";

function sign(path: string, nonceStr: string, body: string, secretB64: string): string {
  const secret = Buffer.from(secretB64, "base64");
  const hash = crypto.createHash("sha256").update(`${nonceStr}${body}`).digest();
  const hmac = crypto.createHmac("sha512", secret).update(Buffer.concat([Buffer.from(path), hash]));
  return hmac.digest("base64");
}

async function privateCall<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const nonceStr = Date.now().toString();
  const body = new URLSearchParams({ nonce: nonceStr, ...params }).toString();
  const res = await fetch(`${KRAKEN_API}${path}`, {
    method: "POST",
    headers: {
      "API-Key": config.kraken.apiKey,
      "API-Sig": sign(path, nonceStr, body, config.kraken.apiSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json()) as { error: string[]; result?: T };
  if (j.error?.length) throw new Error(`Kraken: ${j.error.join("; ")}`);
  return j.result as T;
}

interface OrderInfo {
  descr: { order: string };
  price?: string;
  cost?: string;
  fee?: string;
  vol_exec?: string;
}

interface AddOrderResult {
  descr: { order: string };
  txid: string[];
}

export class KrakenBroker implements Broker {
  readonly mode = "kraken" as const;
  lastPrice = 0;

  setPrice(p: number): void {
    this.lastPrice = p;
  }

  private async submit(side: "buy" | "sell", qtyBtc: number, ref: string): Promise<Fill> {
    const r = await privateCall<AddOrderResult>("/0/private/AddOrder", {
      pair: "XBTUSD",
      type: side,
      ordertype: "market",
      volume: qtyBtc.toFixed(8),
      validate: "false",
    });
    const txid = r.txid[0];
    let price = this.lastPrice;
    let feeUsd = 0;
    try {
      const info = await privateCall<Record<string, OrderInfo>>("/0/private/QueryOrders", { txid });
      const ord = info[txid];
      if (ord?.price) price = Number(ord.price);
      if (ord?.fee) feeUsd = Number(ord.fee);
    } catch {
      // fill price falls back to last known price; fee stays 0
    }
    return {
      side,
      qtyBtc,
      price: Math.round(price * 100) / 100,
      feeUsd: Math.round(feeUsd * 100) / 100,
      slippageUsd: 0,
      ref: `${ref}:${txid}`,
    };
  }

  async marketBuy(qtyBtc: number, ref: string): Promise<Fill> {
    const exposure = await this.exposureUsd();
    if (exposure + qtyBtc * this.lastPrice > config.kraken.maxExposureUsd) {
      throw new Error(
        `exposure cap: $${exposure.toFixed(0)} + $${(qtyBtc * this.lastPrice).toFixed(0)} > $${config.kraken.maxExposureUsd} (KRAKEN_MAX_EXPOSURE_USD)`,
      );
    }
    return this.submit("buy", qtyBtc, ref);
  }

  async marketSell(qtyBtc: number, ref: string): Promise<Fill> {
    return this.submit("sell", qtyBtc, ref);
  }

  async exposureUsd(): Promise<number> {
    const bal = await privateCall<Record<string, string>>("/0/private/Balance", {});
    const btc = Number(bal.XXBT ?? bal.XBT ?? 0);
    return btc * this.lastPrice;
  }
}
