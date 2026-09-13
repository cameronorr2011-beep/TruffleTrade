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
    <div className="mx-auto max-w-[1280px] px-5 pb-16 pt-4 sm:px-8">
      <div className="tt-pageband">
        <div>
          <p className="tt-eyebrow">AI research terminal</p>
          <h1 style={{ margin: 0 }}>
            <span className="tt-page-title">Run the investment committee</span>
          </h1>
          <p className="tt-sub" style={{ maxWidth: 620 }}>
            Six independent analysts investigate the same company, a fact-checker strips every number they can&apos;t
            support, and a red team decides whether the evidence is good enough to issue a thesis at all.
          </p>
        </div>
      </div>

      <RunLauncher initialTicker={params.ticker ?? ""} autorun={params.autorun === "1"} />

      <section className="mt-8">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-bone-soft">
          Recent investigations
        </h2>
        {runs.length === 0 ? (
          <p className="mt-4 rounded-xl border border-soil-600 bg-soil-950 p-5 font-mono text-[0.75rem] text-faint">
            No runs yet. Launch the first investigation above.
          </p>
        ) : (
          <div className="card mt-4 overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-soil-600 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-faint">
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
                  <tr key={r.id} className="border-b border-soil-600 last:border-0 hover:bg-soil-800/30">
                    <td className="px-5 py-3 font-mono text-[0.75rem]">
                      <Link href={`/research/${r.id}`} className="gold-underline text-truffle-300">
                        #{r.id}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-mono text-[0.8rem] text-ink">{r.ticker}</td>
                    <td className="px-5 py-3">
                      <StanceBadge stance={r.stance} />
                    </td>
                    <td className="px-5 py-3 font-mono text-[0.75rem] text-bone-soft">
                      {r.score >= 0 ? "+" : ""}
                      {r.score.toFixed(2)}
                    </td>
                    <td className="px-5 py-3 font-mono text-[0.7rem] uppercase text-bone-soft">{r.confidence}</td>
                    <td className="px-5 py-3 font-mono text-[0.7rem] text-bone-soft">{r.status}</td>
                    <td className="px-5 py-3 font-mono text-[0.7rem] text-faint">{timeAgo(r.ts)}</td>
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
