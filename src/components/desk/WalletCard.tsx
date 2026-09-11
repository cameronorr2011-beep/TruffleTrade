export default function WalletCard({ status }: { status: { configured: boolean; enabled: boolean; address?: string; usdc?: number; cbbtc?: number; gasEth?: number; maxUsdPerTrade: number; maxTotalUsd: number; slippageBps: number } }) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-bone/45">Degen wallet · Base</p>
        <span className={`rounded-full px-2.5 py-1 font-mono text-[0.56rem] uppercase tracking-[0.18em] ${status.enabled ? "bg-jade/15 text-jade" : "bg-soil-800/60 text-bone/50"}`}>
          {status.enabled ? "live on-chain" : status.configured ? "misconfigured" : "locked"}
        </span>
      </div>
      {status.enabled && status.address ? (
        <>
          <p className="mt-3 font-mono text-[0.7rem] text-bone/55">
            {status.address.slice(0, 6)}…{status.address.slice(-4)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-[0.7rem]">
            <div className="rounded-lg bg-soil-950/70 p-2.5">
              <span className="text-bone/40">USDC</span>
              <p className="text-bone">${(status.usdc ?? 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-soil-950/70 p-2.5">
              <span className="text-bone/40">cbBTC</span>
              <p className="text-bone">{(status.cbbtc ?? 0).toFixed(6)}</p>
            </div>
            <div className="rounded-lg bg-soil-950/70 p-2.5">
              <span className="text-bone/40">gas ETH</span>
              <p className={status.gasEth !== undefined && status.gasEth > 0.0005 ? "text-jade" : "text-blood"}>
                {(status.gasEth ?? 0).toFixed(5)}
              </p>
            </div>
            <div className="rounded-lg bg-soil-950/70 p-2.5">
              <span className="text-bone/40">cap/trade</span>
              <p className="text-bone">${status.maxUsdPerTrade}</p>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 text-[0.78rem] leading-relaxed text-bone/45">
          {status.configured
            ? "BROKER_MODE=onchain but ONCHAIN_TRADING!=1 or ONCHAIN_PRIVATE_KEY missing. Real trading is locked."
            : "Real on-chain trading is locked. To enable: dedicated wallet, ONCHAIN_TRADING=1, BROKER_MODE=onchain. See README."}
        </p>
      )}
      <p className="mt-3 font-mono text-[0.6rem] text-bone/35">
        caps: ${status.maxUsdPerTrade}/trade · ${status.maxTotalUsd} total · slippage {status.slippageBps}bps
      </p>
    </div>
  );
}
