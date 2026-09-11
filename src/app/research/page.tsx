import Link from "next/link";
import { recentRuns } from "@core/research/store";
import RunLauncher from "@/components/research/RunLauncher";
import StanceBadge from "@/components/research/StanceBadge";

export const dynamic = "force-dynamic";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string; autorun?: string }>;
}) {
  const params = await searchParams;
  const runs = recentRuns(40);

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-10 sm:px-8">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300/75">
        AI research terminal
      </span>
      <h1 className="font-display mt-3 text-[clamp(1.9rem,4vw,3rem)] font-semibold text-bone">
        Run the investment committee
      </h1>
      <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-bone/55">
        Six independent analysts investigate the same company, a fact-checker strips every number they can&apos;t
        support, and a red team decides whether the evidence is good enough to issue a thesis at all.
      </p>

      <RunLauncher initialTicker={params.ticker ?? ""} autorun={params.autorun === "1"} />

      <section className="mt-12">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone/50">
          Recent investigations
        </h2>
        {runs.length === 0 ? (
          <p className="mt-4 rounded-xl border border-truffle-400/15 bg-soil-900/40 p-5 font-mono text-[0.75rem] text-bone/45">
            No runs yet. Launch the first investigation above.
          </p>
        ) : (
          <div className="card mt-4 overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-truffle-400/15 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-bone/40">
                  <th className="px-5 py-3">Run</th>
                  <th className="px-5 py-3">Ticker</th>
                  <th className="px-5 py-3">Stance</th>
                  <th className="px-5 py-3">Score</th>
                  <th className="px-5 py-3">Confidence</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-truffle-400/8 last:border-0 hover:bg-soil-800/30">
                    <td className="px-5 py-3 font-mono text-[0.75rem]">
                      <Link href={`/research/${r.id}`} className="gold-underline text-truffle-300">
                        #{r.id}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-mono text-[0.8rem] text-bone">{r.ticker}</td>
                    <td className="px-5 py-3">
                      <StanceBadge stance={r.stance} />
                    </td>
                    <td className="px-5 py-3 font-mono text-[0.75rem] text-bone/70">
                      {r.score >= 0 ? "+" : ""}
                      {r.score.toFixed(2)}
                    </td>
                    <td className="px-5 py-3 font-mono text-[0.7rem] uppercase text-bone/60">{r.confidence}</td>
                    <td className="px-5 py-3 font-mono text-[0.7rem] text-bone/50">{r.status}</td>
                    <td className="px-5 py-3 font-mono text-[0.7rem] text-bone/45">{timeAgo(r.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
