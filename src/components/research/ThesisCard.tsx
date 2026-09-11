import type { ResearchRun } from "@core/research/types";

const SCENARIO_LABEL: Record<string, string> = { bull: "Bull", base: "Base", bear: "Bear", "extreme-bear": "Extreme bear" };

export default function ThesisCard({ run }: { run: ResearchRun }) {
  const t = run.thesis;
  return (
    <section className="card mt-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/50">Thesis</h2>
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-bone/35">{t.ticker}</span>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-[0.92rem] leading-relaxed text-bone/80">{t.baseCase}</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-jade/25 bg-jade/5 p-3.5">
              <p className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-jade">Bull case</p>
              <p className="mt-1.5 text-[0.82rem] leading-relaxed text-bone/70">{t.bullCase}</p>
            </div>
            <div className="rounded-lg border border-blood/25 bg-blood/5 p-3.5">
              <p className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-blood">Bear case</p>
              <p className="mt-1.5 text-[0.82rem] leading-relaxed text-bone/70">{t.bearCase}</p>
            </div>
            <div className="rounded-lg border border-truffle-400/20 bg-soil-900/40 p-3.5">
              <p className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-bone/50">Extreme bear</p>
              <p className="mt-1.5 text-[0.82rem] leading-relaxed text-bone/60">{t.extremeBear}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-gold/80">
            Invalidation conditions — measurable, not vibes
          </p>
          {t.invalidationConditions.length === 0 ? (
            <p className="mt-2 font-mono text-[0.7rem] text-bone/45">None issued.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {t.invalidationConditions.map((c, i) => (
                <li key={i} className="rounded-lg border border-truffle-400/15 bg-void/40 p-3">
                  <p className="font-mono text-[0.72rem] text-bone/85">
                    {c.metric} {c.operator} {c.threshold}
                  </p>
                  <p className="mt-1 text-[0.78rem] leading-relaxed text-bone/60">{c.condition}</p>
                  <p className="mt-1 font-mono text-[0.6rem] text-bone/40">{c.basis}</p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-5 font-mono text-[0.56rem] uppercase tracking-[0.22em] text-gold/80">
            Model scenarios — not predictions
          </p>
          {t.scenarios.length === 0 ? (
            <p className="mt-2 font-mono text-[0.7rem] text-bone/45">None issued.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {t.scenarios.map((s, i) => (
                <div key={i} className="rounded-lg border border-truffle-400/15 bg-void/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-bone/85">
                      {SCENARIO_LABEL[s.name] ?? s.name}
                    </p>
                    <p className="font-mono text-[0.7rem] text-truffle-300">{s.probabilityPct}%</p>
                  </div>
                  {s.drivers.length > 0 && (
                    <p className="mt-1.5 text-[0.74rem] leading-relaxed text-bone/55">
                      <span className="text-bone/40">Drivers:</span> {s.drivers.join(" · ")}
                    </p>
                  )}
                  {s.risks.length > 0 && (
                    <p className="mt-1 text-[0.74rem] leading-relaxed text-bone/55">
                      <span className="text-bone/40">Risks:</span> {s.risks.join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
