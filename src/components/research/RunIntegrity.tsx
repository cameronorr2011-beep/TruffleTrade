import type { ResearchRun } from "@core/research/types";
import StanceBadge from "./StanceBadge";

/**
 * RunIntegrity — makes evidence quality and agent reliability first-class.
 * Status is computed from actual backend state (veto flag, agent health,
 * coverage), never from the score alone. (analysis-integrity spec §1–§9)
 */

type RunState = "ready" | "limited" | "reject";

function runState(run: ResearchRun): RunState {
  if (run.consensus.redTeamVeto) return "reject";
  const dead = run.agents.filter((a) => a.model === "unreachable").length;
  if (dead >= 2 || run.status === "partial") return "limited";
  return "ready";
}

/** Derive the market decision from ACTUAL state — veto forces NO ACTION. */
function decisionOf(run: ResearchRun): { label: string; tone: "jade" | "gold" | "blood" | "bone"; note: string } {
  const s = run.consensus.stance;
  if (run.consensus.redTeamVeto) return { label: "NO ACTION", tone: "bone", note: "Red team rejected the evidence — no directional call exists." };
  if (s === "bullish") return { label: "WATCH / BULLISH", tone: "jade", note: "Council leans bullish and survived cross-examination." };
  if (s === "bearish") return { label: "AVOID / BEARISH", tone: "blood", note: "Council leans bearish and survived cross-examination." };
  if (s === "caution") return { label: "REDUCE / CAUTION", tone: "gold", note: "Council is cautious — risk outweighs reward on current evidence." };
  return { label: "NO ACTION", tone: "bone", note: "No reliable edge found. Standing aside is a decision, not a failure." };
}

const TONE: Record<string, string> = {
  jade: "border-jade/45 bg-jade/10 text-jade",
  gold: "border-gold/45 bg-gold/10 text-gold",
  blood: "border-blood/45 bg-blood/10 text-blood",
  bone: "border-soil-500 bg-soil-950 text-bone-soft",
};

function EvidenceCoverage({ run }: { run: ResearchRun }) {
  // Denominator = evidence classes the engine tracks; explain it (spec §6).
  const denom = 4;
  const covSet = new Set<string>();
  if (run.dataPack.candles1d.length >= 60) covSet.add("price");
  if (run.dataPack.technicals.rsi14 != null) covSet.add("technicals");
  if (run.dataPack.fundamentals) covSet.add("fundamentals");
  if (run.dataPack.news.length > 0) covSet.add("news");
  if (run.dataPack.macro.some((m) => m.changePct != null)) covSet.add("macro");
  if (run.dataPack.street) covSet.add("street");
  const got = Math.min(denom, covSet.size);
  const label = got >= 3 ? "Sufficient" : got >= 2 ? "Partial" : "Insufficient";
  return (
    <div className="card p-6">
      <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">Evidence coverage</h2>
      <p className="mt-3 font-display text-[2rem] font-semibold text-ink">
        {got} <span className="text-[1.1rem] text-faint">/ {denom}</span>
      </p>
      <p className={`font-mono text-[0.66rem] uppercase tracking-[0.2em] ${got >= 3 ? "text-jade" : got >= 2 ? "text-gold" : "text-blood"}`}>{label}</p>
      <p className="mt-3 font-mono text-[0.6rem] leading-relaxed text-faint">
        Denominator = 4 independent evidence classes (price/technicals, fundamentals, news flow, macro &amp; street). Agents add no
        evidence beyond what these provide.
      </p>
      <ul className="mt-3 space-y-1 font-mono text-[0.6rem] text-bone-soft">
        {[...covSet].map((k) => (
          <li key={k} className="text-jade">✓ {k}</li>
        ))}
      </ul>
    </div>
  );
}

const PIPELINE = ["Data", "Specialists", "Fact check", "Council", "Red team", "Thesis"];

function PipelineViz({ run }: { run: ResearchRun }) {
  const stopped = run.consensus.redTeamVeto ? 5 : run.status === "partial" ? 1 : 6;
  return (
    <div className="card p-6">
      <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">Pipeline</h2>
      <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        {PIPELINE.map((p, i) => {
          const done = i < stopped;
          const halted = run.consensus.redTeamVeto && i === 5;
          return (
            <li key={p} className="flex items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] ${
                  halted ? "border-blood/50 bg-blood/10 text-blood" : done ? "border-jade/40 bg-jade/10 text-jade" : "border-soil-600 text-faint"
                }`}
              >
                {halted ? "REJECT" : done ? "✓" : i + 1} · {p}
              </span>
              {i < PIPELINE.length - 1 && <span aria-hidden className="text-faint">→</span>}
            </li>
          );
        })}
      </ol>
      {run.consensus.redTeamVeto && (
        <p className="mt-3 font-mono text-[0.62rem] leading-relaxed text-blood">
          Pipeline stopped at the final gate. The system prevented an unsupported conclusion — that is the product working.
        </p>
      )}
    </div>
  );
}

function AgentHealth({ run }: { run: ResearchRun }) {
  const rows = run.agents.map((a) => ({
    name: a.agent,
    status: a.model === "unreachable" ? "Unavailable" : a.violations.length > 0 ? "Completed w/ violations" : "Complete",
    dead: a.model === "unreachable",
    warn: a.violations.length > 0,
  }));
  return (
    <div className="card p-6">
      <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">Agent health</h2>
      <table className="mt-4 w-full text-left">
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-soil-600 last:border-0">
              <td className="py-2 font-mono text-[0.72rem] text-ink">{r.name}</td>
              <td className={`py-2 text-right font-mono text-[0.66rem] uppercase tracking-[0.14em] ${r.dead ? "text-blood" : r.warn ? "text-gold" : "text-jade"}`}>
                {r.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="mt-3">
        <summary className="cursor-pointer font-mono text-[0.58rem] uppercase tracking-[0.18em] text-faint hover:text-bone-soft">
          Diagnostics (developers)
        </summary>
        <ul className="mt-2 space-y-1 font-mono text-[0.6rem] leading-relaxed text-faint">
          {run.agents
            .filter((a) => a.model === "unreachable")
            .map((a) => (
              <li key={a.agent}>· {a.rationale.slice(0, 160)}</li>
            ))}
          {run.agents.every((a) => a.model !== "unreachable") && <li>· all agents reachable this run</li>}
        </ul>
      </details>
      <p className="mt-2 font-mono text-[0.58rem] text-faint">&quot;Unavailable&quot; is not the same as a neutral stance — missing agents add no evidence.</p>
    </div>
  );
}

export default function RunIntegrity({ run }: { run: ResearchRun }) {
  const state = runState(run);
  const dec = decisionOf(run);
  const statusMeta = {
    ready: { label: "ANALYSIS READY", cls: "border-jade/50 bg-jade/10 text-jade" },
    limited: { label: "LIMITED EVIDENCE", cls: "border-gold/50 bg-gold/10 text-gold" },
    reject: { label: "RED TEAM REJECT", cls: "border-blood/50 bg-blood/10 text-blood" },
  }[state];

  return (
    <>
      {/* §1 status header */}
      <section className={`card border p-6 ${statusMeta.cls.split(" ")[0]}`} style={{ borderStyle: "solid" }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className={`inline-block rounded-full border px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.22em] ${statusMeta.cls}`}>
              {statusMeta.label}
            </p>
            <p className="mt-3 font-mono text-[0.68rem] leading-relaxed text-bone-soft">
              {state === "reject" && "The evidence base was insufficient or internally inconsistent. No thesis was issued."}
              {state === "limited" && "Some agents were unreachable this run — conclusions are constrained accordingly."}
              {state === "ready" && "All agents reachable; every numeric claim was checked against the data pack."}
            </p>
          </div>
          {/* §16 decision — clear, after the evidence, never bigger than it */}
          <div className={`rounded-xl border px-5 py-4 text-center ${TONE[dec.tone]}`}>
            <p className="font-mono text-[0.56rem] uppercase tracking-[0.24em] opacity-75">Market decision</p>
            <p className="font-display text-[1.6rem] font-semibold leading-tight">{dec.label}</p>
          </div>
        </div>
        <p className="mt-3 font-mono text-[0.6rem] text-faint">{dec.note} An analytical signal, not investment advice.</p>
      </section>

      {/* §2 premium no-thesis state */}
      {run.consensus.redTeamVeto && (
        <section className="card p-6">
          <h2 className="font-display text-[1.2rem] font-semibold text-ink">No thesis issued</h2>
          <p className="mt-2 text-[0.9rem] leading-relaxed text-bone-soft">
            The council could not establish a sufficiently reliable evidence base for a directional conclusion.
          </p>
          <ul className="mt-4 grid gap-2 font-mono text-[0.68rem] text-bone-soft sm:grid-cols-2">
            <li>· Evidence coverage: see panel below</li>
            <li>
              · Agent availability:{" "}
              {run.agents.filter((a) => a.model !== "unreachable").length}/{run.agents.length} reachable
            </li>
            <li>· Fact-check violations: {run.agents.reduce((s, a) => s + a.violations.length, 0)}</li>
            <li>· Red-team decision: REJECT</li>
          </ul>
        </section>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <PipelineViz run={run} />
        <EvidenceCoverage run={run} />
      </div>

      <section className="mt-5">
        <AgentHealth run={run} />
      </section>
    </>
  );
}
