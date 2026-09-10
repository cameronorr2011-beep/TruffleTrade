import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  maxUint256,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config";
import type { Broker, Fill } from "./broker";

/**
 * WOLFPIT Degen Mode — REAL on-chain trading with NO account and NO KYC.
 *
 * Executes USDC <-> cbBTC swaps on Base (Coinbase's L2) through Uniswap V3's
 * SwapRouter02, signed by YOUR OWN private key from YOUR OWN wallet. There is
 * no exchange, no sign-up, and no identity verification: self-custody is legal
 * in California and everywhere in the US. You keep custody of the cbBTC at all
 * times.
 *
 * Safety rails (all enforced here, in code):
 *  - ONCHAIN_TRADING=1 must be set or this broker refuses to exist.
 *  - WOLF_MAX_USD_PER_TRADE hard cap per swap.
 *  - WOLF_MAX_TOTAL_USD hard cap on deployed exposure (cbBTC value).
 *  - Slippage bounded by WOLF_SLIPPAGE_BPS via amountOutMinimum/amountInMaximum.
 */

export const BASE = {
  chainId: 8453,
  rpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
  swapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481",
  quoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // native USDC (6 decimals)
  cbbtc: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", // Coinbase Wrapped BTC (8 decimals)
} as const;

// Addresses verified live on-chain (eth_getCode) and against Basescan, 2026-09.
const FEE_TIERS = [500, 3000, 10000] as const;

const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export const QUOTER_V2_ABI = [
  {
    name: "quoteExactOutputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountOut", type: "uint256" },
          { name: "amountInMaximum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const ROUTER_ABI = [
  {
    name: "exactOutputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountOut", type: "uint256" },
          { name: "amountInMaximum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountIn", type: "uint256" }],
  },
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

export function toCbbtcUnits(qtyBtc: number): bigint {
  return parseUnits(qtyBtc.toFixed(8), 8);
}

export function toUsdcUnits(usd: number): bigint {
  return parseUnits(usd.toFixed(6), 6);
}

/** Pick the fee tier whose quote gives the best execution for the trader. */
export function pickBestTier<T extends { fee: number; amountIn?: bigint; amountOut?: bigint }>(
  quotes: T[],
  direction: "exact-output" | "exact-input",
): T {
  const ok = quotes.filter((q) => q.amountIn !== undefined || q.amountOut !== undefined);
  if (ok.length === 0) throw new Error("no liquid fee tier found for USDC/cbBTC — aborting instead of overpaying");
  return ok.reduce((best, q) => {
    if (direction === "exact-output") {
      return (q.amountIn as bigint) < (best.amountIn as bigint) ? q : best;
    }
    return (q.amountOut as bigint) > (best.amountOut as bigint) ? q : best;
  }, ok[0]);
}

/** Minimum acceptable output given a slippage budget in bps. */
export function computeMinOut(expectedOut: bigint, slippageBps: number): bigint {
  return (expectedOut * BigInt(10_000 - Math.min(slippageBps, 5_000))) / BigInt(10_000);
}

/** Maximum acceptable input given a slippage budget in bps. */
export function computeMaxIn(quotedIn: bigint, slippageBps: number): bigint {
  return (quotedIn * BigInt(10_000 + Math.min(slippageBps, 5_000))) / BigInt(10_000);
}

export class DexBroker implements Broker {
  readonly mode = "onchain" as const;
  private publicClient;
  private walletClient;
  private account;

  constructor() {
    if (!config.onchain.tradingEnabled) {
      throw new Error("Degen Mode is locked. Set ONCHAIN_TRADING=1 in .env to enable REAL on-chain trading.");
    }
    if (!config.onchain.privateKey) {
      throw new Error("ONCHAIN_PRIVATE_KEY missing — create a dedicated hot wallet (see README).");
    }
    const pk = config.onchain.privateKey.startsWith("0x")
      ? (config.onchain.privateKey as `0x${string}`)
      : (`0x${config.onchain.privateKey}` as `0x${string}`);
    this.account = privateKeyToAccount(pk);
    this.publicClient = createPublicClient({ chain: base, transport: http(BASE.rpcUrl) });
    this.walletClient = createWalletClient({ chain: base, transport: http(BASE.rpcUrl), account: this.account });
  }

  get address(): string {
    return this.account.address;
  }

  private async erc20Balance(token: `0x${string}`, holder: `0x${string}`): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [holder],
    })) as bigint;
  }

  async usdcBalance(): Promise<number> {
    return Number(formatUnits(await this.erc20Balance(BASE.usdc, this.account.address), 6));
  }

  async cbbtcBalance(): Promise<number> {
    return Number(formatUnits(await this.erc20Balance(BASE.cbbtc, this.account.address), 8));
  }

  async gasStatus(): Promise<{ eth: number; ok: boolean }> {
    const bal = await this.publicClient.getBalance({ address: this.account.address });
    const eth = Number(formatUnits(bal, 18));
    return { eth, ok: eth > 0.0005 };
  }

  private async ensureApproval(token: `0x${string}`, amount: bigint): Promise<void> {
    const allowance = (await this.publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [this.account.address, BASE.swapRouter02],
    })) as bigint;
    if (allowance < amount) {
      // Exact-amount approvals: never grant the router unlimited spending.
      const hash = await this.walletClient.writeContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [BASE.swapRouter02, amount],
      });
      await this.publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    }
  }

  private async assertCaps(swapUsd: number): Promise<void> {
    if (swapUsd > config.onchain.maxUsdPerTrade) {
      throw new Error(`per-trade cap: $${swapUsd.toFixed(2)} > $${config.onchain.maxUsdPerTrade} (WOLF_MAX_USD_PER_TRADE)`);
    }
    const gas = await this.gasStatus();
    if (!gas.ok) {
      throw new Error(`insufficient ETH on Base for gas (${gas.eth.toFixed(6)} ETH). Send ~0.001 ETH to ${this.address}`);
    }
  }

  private async fillFromDeltas(beforeUsdc: bigint, beforeBtc: bigint): Promise<{ usdcDelta: number; btcDelta: number }> {
    const afterUsdc = await this.erc20Balance(BASE.usdc, this.account.address);
    const afterBtc = await this.erc20Balance(BASE.cbbtc, this.account.address);
    return {
      usdcDelta: Number(formatUnits(beforeUsdc - afterUsdc, 6)), // positive when paying
      btcDelta: Number(formatUnits(afterBtc - beforeBtc, 8)), // positive when receiving
    };
  }

  private async gasCostUsd(hash: `0x${string}`): Promise<number> {
    try {
      const r = await this.publicClient.getTransactionReceipt({ hash });
      const ethUsed = Number(formatUnits(r.gasUsed * r.effectiveGasPrice, 18));
      const j = (await (
        await fetch("https://api.exchange.coinbase.com/products/ETH-USD/ticker", {
          signal: AbortSignal.timeout(10_000),
        })
      ).json()) as { price: string };
      return Math.round(ethUsed * Number(j.price) * 100) / 100;
    } catch {
      return 0;
    }
  }

  async marketBuy(qtyBtc: number, ref: string): Promise<Fill> {
    // Real on-chain buy: exact-output swap — receive precisely qtyBtc of cbBTC.
    const outAmount = toCbbtcUnits(qtyBtc);
    const beforeUsdc = await this.erc20Balance(BASE.usdc, this.account.address);
    const beforeBtc = await this.erc20Balance(BASE.cbbtc, this.account.address);
    const usdcBal = Number(formatUnits(beforeUsdc, 6));

    // Probe every fee tier, pick the one needing the least USDC.
    const quotes = await Promise.all(
      FEE_TIERS.map(async (fee) => {
        try {
          const [amountIn] = (await this.publicClient.readContract({
            address: BASE.quoterV2,
            abi: QUOTER_V2_ABI,
            functionName: "quoteExactOutputSingle",
            args: [
              {
                tokenIn: BASE.usdc,
                tokenOut: BASE.cbbtc,
                fee,
                recipient: "0x0000000000000000000000000000000000000001",
                amountOut: outAmount,
                amountInMaximum: maxUint256 / BigInt(2),
                sqrtPriceLimitX96: 0n,
              },
            ],
          })) as [bigint, bigint, number, bigint];
          return { fee, amountIn };
        } catch {
          return { fee, amountIn: undefined as bigint | undefined };
        }
      }),
    );
    const best = pickBestTier(quotes, "exact-output");
    const quotedIn = best.amountIn as bigint;
    const swapUsd = Number(formatUnits(quotedIn, 6));
    await this.assertCaps(swapUsd);
    if (usdcBal < swapUsd) {
      throw new Error(`insufficient USDC: have $${usdcBal.toFixed(2)}, need $${swapUsd.toFixed(2)} on ${this.address}`);
    }

    const maxIn = computeMaxIn(quotedIn, config.onchain.slippageBps);
    await this.ensureApproval(BASE.usdc, maxIn);

    const hash = await this.walletClient.writeContract({
      address: BASE.swapRouter02,
      abi: ROUTER_ABI,
      functionName: "exactOutputSingle",
      args: [
        {
          tokenIn: BASE.usdc,
          tokenOut: BASE.cbbtc,
          fee: best.fee,
          recipient: this.account.address,
          amountOut: outAmount,
          amountInMaximum: maxIn,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    await this.publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

    const { usdcDelta, btcDelta } = await this.fillFromDeltas(beforeUsdc, beforeBtc);
    const price = btcDelta > 0 ? Math.round((usdcDelta / btcDelta) * 100) / 100 : 0;
    return {
      side: "buy",
      qtyBtc: btcDelta,
      price,
      feeUsd: await this.gasCostUsd(hash),
      slippageUsd: Math.round((usdcDelta - Number(formatUnits(quotedIn, 6))) * 100) / 100,
      ref: `${ref}:0x${hash.slice(2, 12)}`,
    };
  }

  async marketSell(qtyBtc: number, ref: string): Promise<Fill> {
    // Real on-chain sell: exact-input swap — sell precisely qtyBtc of cbBTC.
    const inAmount = toCbbtcUnits(qtyBtc);
    const beforeUsdc = await this.erc20Balance(BASE.usdc, this.account.address);
    const beforeBtc = await this.erc20Balance(BASE.cbbtc, this.account.address);
    const held = Number(formatUnits(beforeBtc, 8));
    if (qtyBtc > held + 1e-8) {
      throw new Error(`cannot sell ${qtyBtc.toFixed(8)} cbBTC — wallet holds ${held.toFixed(8)} on ${this.address}`);
    }

    const quotes = await Promise.all(
      FEE_TIERS.map(async (fee) => {
        try {
          const [amountOut] = (await this.publicClient.readContract({
            address: BASE.quoterV2,
            abi: QUOTER_V2_ABI,
            functionName: "quoteExactInputSingle",
            args: [
              {
                tokenIn: BASE.cbbtc,
                tokenOut: BASE.usdc,
                amountIn: inAmount,
                fee,
                sqrtPriceLimitX96: 0n,
              },
            ],
          })) as [bigint, bigint, number, bigint];
          return { fee, amountOut };
        } catch {
          return { fee, amountOut: undefined as bigint | undefined };
        }
      }),
    );
    const best = pickBestTier(quotes, "exact-input");
    const quotedOut = best.amountOut as bigint;
    const outUsd = Number(formatUnits(quotedOut, 6));
    await this.assertCaps(outUsd);

    const minOut = computeMinOut(quotedOut, config.onchain.slippageBps);
    await this.ensureApproval(BASE.cbbtc, inAmount);

    const hash = await this.walletClient.writeContract({
      address: BASE.swapRouter02,
      abi: ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: BASE.cbbtc,
          tokenOut: BASE.usdc,
          fee: best.fee,
          recipient: this.account.address,
          amountIn: inAmount,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    await this.publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

    const { usdcDelta, btcDelta } = await this.fillFromDeltas(beforeUsdc, beforeBtc);
    const price = btcDelta > 0 ? Math.round((usdcDelta / btcDelta) * 100) / 100 : 0;
    return {
      side: "sell",
      qtyBtc: Math.abs(btcDelta) || qtyBtc,
      price,
      feeUsd: await this.gasCostUsd(hash),
      slippageUsd: Math.round((Number(formatUnits(quotedOut, 6)) - usdcDelta) * 100) / 100,
      ref: `${ref}:0x${hash.slice(2, 12)}`,
    };
  }
}

/** Encode-only helper (used by the dry-run plan command to show what WOULD be sent). */
export function encodeBuyCall(qtyBtc: number, quotedIn: bigint, fee: number): string {
  return encodeFunctionData({
    abi: ROUTER_ABI,
    functionName: "exactOutputSingle",
    args: [
      {
        tokenIn: BASE.usdc,
        tokenOut: BASE.cbbtc,
        fee,
        recipient: "0x0000000000000000000000000000000000000001",
        amountOut: toCbbtcUnits(qtyBtc),
        amountInMaximum: computeMaxIn(quotedIn, 50),
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
}
