import type { ValuationModel } from "@core/research/types";

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default function ValuationCard({ valuation }: { valuation: ValuationModel }) {
  const { dcf, dcfError, reverseDcf, comps } = valuation;

  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="card p-6">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/50">DCF — model scenario</h2>
        {dcf ? (
          <>
            <p className="mt-3">
              <span className="font-display text-[1.8rem] font-semibold text-bone">{usd(dcf.fairValue)}</span>
              <span className="ml-2 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-bone/40">
                per share · assumptions below
              </span>
            </p>
            <table className="mt-4 w-full text-left font-mono text-[0.68rem]">
              <tbody>
                {[
                  ["Base FCF (TTM)", usd(dcf.assumptions.baseFcf)],
                  ["Growth years 1–5", `${(dcf.assumptions.growthYears1to5 * 100).toFixed(1)}%`],
                  ["Terminal growth", `${(dcf.assumptions.growthTerminal * 100).toFixed(1)}%`],
                  ["Discount rate", `${(dcf.assumptions.discountRate * 100).toFixed(1)}%`],
                  ["Net debt", usd(dcf.assumptions.netDebt)],
                  ["PV explicit / terminal", `${usd(dcf.pvExplicit)} / ${usd(dcf.pvTerminal)}`],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-pit-300/8 last:border-0">
                    <td className="py-1.5 text-bone/45">{k}</td>
                    <td className="py-1.5 text-right text-bone/85">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-bone/40">
              Sensitivity — discount rate × terminal growth
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {dcf.sensitivity.map((s, i) => (
                <div key={i} className="rounded-md border border-pit-300/12 bg-pit-900/50 px-2 py-1.5 text-center">
                  <p className="font-mono text-[0.54rem] text-bone/40">
                    r{(s.discountRate * 100).toFixed(0)}% g{(s.terminalGrowth * 100).toFixed(1)}%
                  </p>
                  <p className="font-mono text-[0.72rem] text-bone/85">{usd(s.fairValue)}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[0.72rem] leading-relaxed text-bone/40">
              This is a model scenario, not a price target. Fair value moves materially with the assumptions above;
              the sensitivity grid shows the range.
            </p>
          </>
        ) : (
          <p className="mt-4 rounded-lg border border-pit-300/15 bg-pit-900/40 p-4 font-mono text-[0.72rem] leading-relaxed text-bone/55">
            DATA UNAVAILABLE — {dcfError}
          </p>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/50">
          Reverse DCF & peer comps
        </h2>
        {reverseDcf ? (
          <p className="mt-3 text-[0.86rem] leading-relaxed text-bone/70">
            The current price of <strong className="text-bone">{usd(reverseDcf.price)}</strong> implies{" "}
            <strong className="text-ember-300">{(reverseDcf.impliedGrowthYears1to5 * 100).toFixed(1)}%</strong>{" "}
            annual FCF growth for 5 years. If that exceeds any plausible operating forecast, expectations are
            already rich.
          </p>
        ) : (
          <p className="mt-3 font-mono text-[0.7rem] text-bone/45">
            Reverse DCF: DATA UNAVAILABLE (requires positive FCF and a solvable DCF).
          </p>
        )}
        {comps.length > 0 ? (
          <table className="mt-5 w-full text-left">
            <thead>
              <tr className="border-b border-pit-300/15 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-bone/40">
                <th className="pb-2">Metric</th>
                <th className="pb-2 text-right">Company</th>
                <th className="pb-2 text-right">Peer median</th>
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.metric} className="border-b border-pit-300/8 last:border-0">
                  <td className="py-2 text-[0.78rem] text-bone/70">{c.metric}</td>
                  <td className="py-2 text-right font-mono text-[0.72rem] text-bone">
                    {c.value == null ? <span className="text-bone/35">unavailable</span> : c.value.toFixed(1)}
                  </td>
                  <td className="py-2 text-right font-mono text-[0.72rem] text-bone/60">
                    {c.peerMedian == null ? <span className="text-bone/35">unavailable</span> : c.peerMedian.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 font-mono text-[0.7rem] text-bone/45">Peer comps: DATA UNAVAILABLE.</p>
        )}
      </div>
    </section>
  );
}
