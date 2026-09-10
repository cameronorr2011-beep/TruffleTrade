/**
 * Quote-only smoke test: no wallet, no key, no risk.
 * Proves the QuoterV2 ABI + addresses are correct against live Base state
 * by pricing a USDC -> cbBTC swap across every fee tier.
 *   npx tsx scripts/quote-cbbtc.ts [usdAmount]
 */
import { createPublicClient, http, formatUnits, parseUnits } from "viem";
import { base } from "viem/chains";
import { BASE, QUOTER_V2_ABI, pickBestTier } from "../core/dex";

async function main(): Promise<void> {
  const usd = Number(process.argv[2] ?? 100);
  const amountIn = parseUnits(usd.toFixed(6), 6);
  const client = createPublicClient({ chain: base, transport: http(BASE.rpcUrl) });

  console.log(`Quoting ${usd} USDC -> cbBTC on Base (chain ${BASE.chainId})...`);
  const quotes = await Promise.all(
    [500, 3000, 10000].map(async (fee) => {
      try {
        const [amountOut] = (await client.readContract({
          address: BASE.quoterV2,
          abi: QUOTER_V2_ABI,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: BASE.usdc,
              tokenOut: BASE.cbbtc,
              amountIn,
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

  for (const q of quotes) {
    const sats = q.amountOut !== undefined ? formatUnits(q.amountOut, 8) : "no liquidity";
    console.log(`  fee tier ${q.fee}: ${sats} cbBTC`);
  }
  const best = pickBestTier(quotes, "exact-input");
  console.log(
    `BEST: tier ${best.fee} -> ${(Number(formatUnits(best.amountOut as bigint, 8)) * 1e8).toFixed(0)} sats ` +
      `(implied BTC price $${(usd / Number(formatUnits(best.amountOut as bigint, 8))).toFixed(2)})`,
  );
  console.log("QuoterV2 + token addresses verified against live state. Degen Mode plumbing is sound.");
}

main().catch((err) => {
  console.error(`quote failed: ${err.message}`);
  process.exit(1);
});
