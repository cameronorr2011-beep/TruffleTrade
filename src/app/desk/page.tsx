import { deskSnapshot } from "@/lib/desk";
import EquityCurve from "@/components/desk/EquityCurve";
import CouncilRoom from "@/components/desk/CouncilRoom";
import TradeLog from "@/components/desk/TradeLog";
import DeskControls from "@/components/desk/DeskControls";
import PriceHeader from "@/components/desk/PriceHeader";

export const dynamic = "force-dynamic";

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default async function DeskPage() {
  const snap = await deskSnapshot();
  const a = snap.account;
  const pnlPct = a.peakEquityUsd > 0 ? ((a.equityUsd / a.peakEquityUsd - 1) * 100).toFixed(1) : "0.0";

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-10 sm:px-8">
      <PriceHeader price={snap.btcPrice} source={snap.priceSource} mode={snap.mode} cycleSeconds={snap.cycleSeconds} />

      <div className="mt-8 grid gap-5 lg:grid-cols-4">
        <div className="card p-6">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-bone/45">Equity (mark)</p>
          <p className="font-display mt-2 text-[2rem] font-semibold text-bone">{usd(a.equityUsd)}</p>
          <p className="mt-1 font-mono text-[0.66rem] text-bone/40">
            cash {usd(a.cashUsd)} · from peak {pnlPct}%
          </p>
        </div>
        <div className="card p-6">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-bone/45">Position</p>
          <p className={`font-display mt-2 text-[2rem] font-semibold ${a.position.side === "long" ? "text-jade" : "text-bone/70"}`}>
            {a.position.side.toUpperCase()}
          </p>
          <p className="mt-1 font-mono text-[0.66rem] text-bone/40">
            {a.position.side === "long"
              ? `${a.position.qtyBtc.toFixed(6)} BTC @ ${usd(a.position.entryPrice)}`
              : "waiting for the pit to agree"}
          </p>
        </div>
        <div className="card p-6">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-bone/45">Realized P&L</p>
          <p className={`font-display mt-2 text-[2rem] font-semibold ${(snap.stats.realizedPnlUsd ?? 0) >= 0 ? "text-jade" : "text-blood"}`}>
            {usd(snap.stats.realizedPnlUsd ?? 0)}
          </p>
          <p className="mt-1 font-mono text-[0.66rem] text-bone/40">
            {snap.stats.trades} closed · win rate{" "}
            {snap.stats.winRate == null ? "—" : `${Math.round(snap.stats.winRate * 100)}%`}
          </p>
        </div>
        <div className="card p-6">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-bone/45">Kill switch</p>
          <p className={`font-display mt-2 text-[1.5rem] font-semibold ${a.halted ? "text-blood" : "text-jade"}`}>
            {a.halted ? "HALTED" : "ARMED"}
          </p>
          <p className="mt-1 font-mono text-[0.66rem] text-bone/40">
            {a.halted ? a.haltReason ?? "halted" : "flatlines at -15% from peak equity"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <section className="card p-6 lg:col-span-3">
          <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/50">Equity curve</h2>
          <EquityCurve points={snap.equityCurve} />
        </section>
        <section className="card p-6 lg:col-span-2">
          <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/50">Desk controls</h2>
          <DeskControls halted={a.halted} />
        </section>
      </div>

      <section className="mt-5">
        <CouncilRoom council={snap.lastCouncil} />
      </section>

      <section className="mt-5">
        <TradeLog trades={snap.trades} />
      </section>
    </div>
  );
}
