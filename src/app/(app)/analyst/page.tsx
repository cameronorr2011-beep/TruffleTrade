import type { Metadata } from "next";
import AnalystWorkspace from "@/components/app/AnalystWorkspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI Analyst · TruffleTrade" };

export default async function AnalystPage({ searchParams }: { searchParams: Promise<{ ticker?: string }> }) {
  const params = await searchParams;
  return (
    <div className="tt-stack">
      <header className="tt-pageband">
        <div>
          <p className="tt-eyebrow">AI Analyst</p>
          <h1 className="tt-page-title">Your pick. Our machines.</h1>
          <p className="tt-sub">
            Choose any listed stock — the chart, the twin simulation, and the council all read the same symbol you
            choose.
          </p>
        </div>
      </header>
      <AnalystWorkspace initialTicker={params.ticker} />
    </div>
  );
}
