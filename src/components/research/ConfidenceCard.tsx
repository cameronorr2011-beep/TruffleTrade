import type { ResearchRun } from "@core/research/types";

/** Recomputes nothing: shows the run's stored confidence breakdown honestly. */
export default function ConfidenceCard({ run }: { run: ResearchRun }) {
  // The confidence report lives in the thesis; if red team vetoed, show run-level facts only.
  const conf = run.thesis.confidence;
  const showConf = conf.breakdown.length > 0 && conf.breakdown[0] !== "see run-level confidence report";
  const rows: { label: string; value: string }[] = showConf
    ? [
        { label: "Data completeness", value: `${(conf.dataCompleteness * 100).toFixed(0)}%` },
        { label: "Source quality", value: conf.sourceQuality.toFixed(2) },
        { label: "Recency", value: `${(conf.recency * 100).toFixed(0)}%` },
        { label: "Agreement", value: conf.agreement.toFixed(2) },
        { label: "Contradiction", value: conf.contradiction.toFixed(2) },
      ]
    : [{ label: "Confidence", value: "NOT COMPUTED — red team rejected the evidence base" }];

  return (
    <div className="card p-6">
      <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/50">Confidence</h2>
      {showConf && (
        <p className="mt-3">
          <span
            className={`font-display text-[1.9rem] font-semibold ${
              conf.level === "high" ? "text-jade" : conf.level === "moderate" ? "text-gold" : "text-blood"
            }`}
          >
            {conf.level.toUpperCase()}
          </span>
        </p>
      )}
      <dl className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-truffle-400/8 pb-1.5">
            <dt className="font-mono text-[0.66rem] uppercase tracking-[0.16em] text-bone/45">{row.label}</dt>
            <dd className="font-mono text-[0.72rem] text-bone/80">{row.value}</dd>
          </div>
        ))}
      </dl>
      {showConf && (
        <ul className="mt-4 space-y-1 font-mono text-[0.6rem] leading-relaxed text-bone/40">
          {conf.breakdown.map((b, i) => (
            <li key={i}>· {b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
