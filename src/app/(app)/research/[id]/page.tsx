import Link from "next/link";
import { notFound } from "next/navigation";
import { getResearchRun } from "@core/research/store";
import StanceBadge from "@/components/research/StanceBadge";
import AgentCard from "@/components/research/AgentCard";
import ConfidenceCard from "@/components/research/ConfidenceCard";
import ValuationCard from "@/components/research/ValuationCard";
import ThesisCard from "@/components/research/ThesisCard";
import RunIntegrity from "@/components/research/RunIntegrity";

export const dynamic = "force-dynamic";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function RunDossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) notFound();
  const run = getResearchRun(numId);
  if (!run) notFound();

  const c = run.consensus;
  const councilLines = c.lines.filter((l) => l.agent !== "RedTeam");
  const redTeamLine = c.lines.find((l) => l.agent === "RedTeam");
  const violations = run.agents.flatMap((a) => a.violations.map((v) => ({ ...v, agent: a.agent })));

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-10 sm:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/75">
            Research dossier · run #{run.id}
          </span>
          <h1 className="font-display mt-2 text-[clamp(2rem,4.5vw,3.4rem)] font-semibold text-ink">
            {run.ticker}
            <span className={`ml-4 align-middle font-mono text-[0.85rem] ${run.status === "complete" ? "text-jade" : "text-gold"}`}>
              {run.status}
            </span>
          </h1>
        </div>
        <div className="text-right font-mono text-[0.66rem] text-faint">
          <p>{timeAgo(run.ts)}</p>
          <p>{(run.durationMs / 1000).toFixed(1)}s · 7 AI calls</p>
          <Link href={`/company/${run.ticker}`} className="gold-underline text-truffle-300">
            company dossier →
          </Link>
        </div>
      </div>

      {/* Integrity: status header, decision, pipeline, coverage, agent health */}
      <div className="mt-8">
        <RunIntegrity run={run} />
      </div>

      {/* Synthesis */}
      <section className="card mt-5 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <StanceBadge stance={c.stance} />
          <span className="font-mono text-[0.72rem] text-bone-soft">
            consensus score {c.score >= 0 ? "+" : ""}
            {c.score.toFixed(2)} · disagreement {c.disagreement}
            {c.redTeamVeto && <strong className="ml-2 text-blood">RED TEAM REJECT</strong>}
          </span>
        </div>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-bone-soft">{c.synthesis}</p>
        <p className="mt-3 font-mono text-[0.62rem] text-faint">
          {c.redTeamVeto
            ? "No thesis issued — the red team judged the evidence insufficient."
            : run.thesis.summary}
        </p>
      </section>

      {/* Council table */}
      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">Council verdicts</h2>
          <table className="mt-4 w-full text-left">
            <thead>
              <tr className="border-b border-soil-600 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                <th className="pb-2">Agent</th>
                <th className="pb-2">Stance</th>
                <th className="pb-2">Self</th>
                <th className="pb-2">Verified</th>
                <th className="pb-2">Weight</th>
              </tr>
            </thead>
            <tbody>
              {councilLines.map((l) => (
                <tr key={l.agent} className="border-b border-soil-600 last:border-0">
                  <td className="py-2.5 font-mono text-[0.78rem] text-ink">{l.agent}</td>
                  <td className="py-2.5">
                    <StanceBadge stance={l.stance} />
                  </td>
                  <td className="py-2.5 font-mono text-[0.7rem] text-bone-soft">{l.selfConfidence.toFixed(2)}</td>
                  <td className="py-2.5 font-mono text-[0.7rem] text-bone-soft">{l.verifiedConfidence.toFixed(2)}</td>
                  <td className="py-2.5 font-mono text-[0.7rem] text-truffle-300">{l.weight.toFixed(2)}</td>
                </tr>
              ))}
              {redTeamLine && (
                <tr className="border-t border-soil-500">
                  <td className="py-2.5 font-mono text-[0.78rem] text-truffle-300">RedTeam</td>
                  <td className="py-2.5">
                    <StanceBadge stance={redTeamLine.stance} />
                  </td>
                  <td className="py-2.5 font-mono text-[0.7rem] text-bone-soft">{redTeamLine.selfConfidence.toFixed(2)}</td>
                  <td className="py-2.5 font-mono text-[0.7rem] text-bone-soft">{redTeamLine.verifiedConfidence.toFixed(2)}</td>
                  <td className="py-2.5 font-mono text-[0.7rem] text-truffle-300">{redTeamLine.weight.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-3 font-mono text-[0.6rem] leading-relaxed text-faint">{councilLines[0]?.weightBreakdown}</p>
        </div>
        <ConfidenceCard run={run} />
      </section>

      {/* Thesis */}
      {!c.redTeamVeto && <ThesisCard run={run} />}

      {/* Agents */}
      <section className="mt-5">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">
          Agent transcripts & evidence
        </h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {run.agents.map((a) => (
            <AgentCard key={a.agent} agent={a} />
          ))}
        </div>
      </section>

      {/* Valuation */}
      <section className="mt-5">
        <ValuationCard valuation={run.valuation} />
      </section>

      {/* Fact-check violations */}
      <section className="card mt-5 p-6">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">
          Fact-check ledger
        </h2>
        {violations.length === 0 ? (
          <p className="mt-3 font-mono text-[0.72rem] text-jade">
            No violations this run — every numeric claim matched the data pack.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {violations.map((v, i) => (
              <li key={i} className="rounded-lg border border-blood/30 bg-blood/5 p-3 font-mono text-[0.7rem] leading-relaxed">
                <p className="text-blood">FACT-CHECK ISSUE · {v.agent} [{v.reason}]</p>
                <p className="mt-1 text-ink">{v.metric ?? v.claim}</p>
                <p className="mt-0.5">
                  <span className="text-bone-soft">Agent stated: {v.stated ?? "—"}</span>
                  <span className="mx-2 text-faint">·</span>
                  <span className="text-jade">Verified data: {v.actual ?? "—"}</span>
                  <span className="mx-2 text-faint">·</span>
                  <span className="text-blood">Status: CONTRADICTED</span>
                </p>
                <span className="mt-1 block text-faint">{v.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Prompt versions + errors */}
      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">Prompt versions</h2>
          <ul className="mt-3 space-y-1.5 font-mono text-[0.68rem] text-bone-soft">
            {Object.entries(run.promptVersions).map(([k, v]) => (
              <li key={k}>
                <span className="text-faint">{k}</span> {v}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6">
          <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">Run diagnostics</h2>
          <ul className="mt-3 space-y-1.5 font-mono text-[0.68rem] text-bone-soft">
            <li>sources: {run.dataPack.sources.join(", ") || "none"}</li>
            <li>duration: {(run.durationMs / 1000).toFixed(1)}s</li>
            {run.errors.length === 0 ? (
              <li className="text-jade">no data errors</li>
            ) : (
              run.errors.map((e, i) => (
                <li key={i} className="text-gold">
                  {e}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
