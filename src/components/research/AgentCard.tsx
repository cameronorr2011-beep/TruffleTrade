import type { AgentOutput } from "@core/research/types";
import StanceBadge from "./StanceBadge";

export default function AgentCard({ agent }: { agent: AgentOutput }) {
  const isRed = agent.agent === "RedTeam";
  return (
    <article className={`card p-6 ${isRed ? "border-ember-400/35" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={`font-mono text-[0.85rem] font-semibold tracking-[0.12em] ${isRed ? "text-ember-300" : "text-bone"}`}>
          {agent.agent.toUpperCase()}
        </h3>
        <StanceBadge stance={agent.stance} />
      </div>
      <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-bone/35">
        {agent.promptVersion} · {agent.model}
        {isRed && " · fail-closed"}
      </p>

      <p className="mt-4 text-[0.86rem] leading-relaxed text-bone/70">{agent.rationale}</p>

      {agent.strengths.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-jade/70">Strengths</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[0.8rem] leading-relaxed text-bone/60">
            {agent.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {agent.weaknesses.length > 0 && (
        <div className="mt-3">
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-blood/70">Weaknesses</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[0.8rem] leading-relaxed text-bone/60">
            {agent.weaknesses.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {agent.assumptions.length > 0 && (
        <div className="mt-3">
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-gold/70">Assumptions</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[0.8rem] leading-relaxed text-bone/60">
            {agent.assumptions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {agent.evidence.length > 0 && (
        <div className="mt-4 border-t border-pit-300/10 pt-3">
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-bone/40">
            Evidence ({agent.evidence.length})
          </p>
          <ul className="mt-2 space-y-1">
            {agent.evidence.slice(0, 6).map((e) => (
              <li key={e.id} className="font-mono text-[0.64rem] text-bone/50">
                <span className="text-pit-300">{e.sourceType}</span> · {e.claim} · {e.calculation}
              </li>
            ))}
          </ul>
        </div>
      )}

      {agent.violations.length > 0 && (
        <div className="mt-3 rounded-lg border border-blood/30 bg-blood/5 p-3">
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-blood">
            Fact-check violations ({agent.violations.length})
          </p>
          <ul className="mt-1.5 space-y-1">
            {agent.violations.map((v, i) => (
              <li key={i} className="font-mono text-[0.64rem] leading-relaxed text-bone/65">
                [{v.reason}] {v.claim} — {v.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
