import type { CouncilSummary } from "@/lib/desk";

const SIDE_COLOR: Record<string, string> = {
  buy: "#35c98e",
  sell: "#d1462f",
  hold: "#8b8b9e",
};

function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 90) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function CouncilRoom({ council }: { council: CouncilSummary | null }) {
  if (!council) {
    return (
      <div className="card p-6">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">Council room</h2>
        <p className="mt-4 font-mono text-[0.72rem] text-faint">
          No council session yet. The pit convenes on the first engine cycle.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">Council room</h2>
        <span className="font-mono text-[0.62rem] text-faint">
          {ago(council.ts)} · BTC {council.btcPrice.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="font-display text-[1.6rem] font-semibold" style={{ color: SIDE_COLOR[council.side] ?? "#f4efe9" }}>
          {council.side.toUpperCase()}
        </span>
        <span className="rounded-full border border-soil-600 px-3 py-1 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-bone-soft">
          conviction {council.conviction.toFixed(2)}
        </span>
        <span className="text-[0.85rem] text-bone-soft">{council.rationale}</span>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {council.votes.map((v) => (
          <article key={v.agent} className="rounded-xl border border-soil-600 bg-soil-950/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[0.72rem] font-semibold tracking-[0.12em] text-ink">{v.agent.toUpperCase()}</span>
              <span className="font-mono text-[0.66rem] font-semibold uppercase" style={{ color: SIDE_COLOR[v.side] ?? "#f4efe9" }}>
                {v.side} {v.confidence.toFixed(2)}
              </span>
            </div>
            <p className="mt-2 text-[0.78rem] leading-relaxed text-bone-soft">{v.rationale}</p>
          </article>
        ))}

        <article className={`rounded-xl border p-4 ${council.redTeam.approved ? "border-jade/40 bg-jade/5" : "border-blood/40 bg-blood/5"}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.72rem] font-semibold tracking-[0.12em] text-ink">RED TEAM</span>
            <span className={`font-mono text-[0.66rem] font-semibold uppercase ${council.redTeam.approved ? "text-jade" : "text-blood"}`}>
              {council.redTeam.approved ? "approved" : "blocked"}
            </span>
          </div>
          {council.redTeam.objections.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[0.78rem] leading-relaxed text-bone-soft">
              {council.redTeam.objections.slice(0, 3).map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[0.78rem] leading-relaxed text-bone-soft">{council.redTeam.notes || "no objections raised"}</p>
          )}
        </article>
      </div>
    </div>
  );
}
