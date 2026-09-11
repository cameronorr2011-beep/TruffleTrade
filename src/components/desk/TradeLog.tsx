import type { LedgerTrade } from "@core/types";

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function when(ts: number): string {
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function TradeLog({ trades }: { trades: LedgerTrade[] }) {
  return (
    <div className="card p-6">
      <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">Trade blotter</h2>
      {trades.length === 0 ? (
        <p className="mt-4 font-mono text-[0.72rem] text-faint">No fills yet. The pit is patient.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left font-mono text-[0.72rem]">
            <thead>
              <tr className="border-b border-soil-600 text-faint">
                <th className="py-2 pr-4 font-medium uppercase tracking-[0.16em]">Time</th>
                <th className="py-2 pr-4 font-medium uppercase tracking-[0.16em]">Side</th>
                <th className="py-2 pr-4 font-medium uppercase tracking-[0.16em]">Qty BTC</th>
                <th className="py-2 pr-4 font-medium uppercase tracking-[0.16em]">Price</th>
                <th className="py-2 pr-4 font-medium uppercase tracking-[0.16em]">P&L</th>
                <th className="py-2 font-medium uppercase tracking-[0.16em]">Reason</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-soil-600 text-bone-soft">
                  <td className="py-2.5 pr-4 text-faint">{when(t.ts)}</td>
                  <td className={`py-2.5 pr-4 font-semibold uppercase ${t.side === "buy" ? "text-jade" : "text-truffle-300"}`}>{t.side}</td>
                  <td className="py-2.5 pr-4">{t.qtyBtc.toFixed(6)}</td>
                  <td className="py-2.5 pr-4">{usd(t.price)}</td>
                  <td className={`py-2.5 pr-4 ${t.realizedPnlUsd == null ? "text-faint" : t.realizedPnlUsd >= 0 ? "text-jade" : "text-blood"}`}>
                    {t.realizedPnlUsd == null ? "open" : usd(t.realizedPnlUsd)}
                  </td>
                  <td className="max-w-[260px] truncate py-2.5 text-faint" title={t.reason}>{t.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
