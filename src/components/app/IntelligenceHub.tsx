"use client";

import { useState } from "react";
import MarketIntelPanel from "./MarketIntelPanel";
import PeersPanel from "./PeersPanel";
import WorldRadar from "./WorldRadar";

/**
 * The intelligence hub: one shared ticker drives the digital-twin confidence,
 * the cross-referenced prediction, and the competitor ranking — so clicking a
 * quick-pick re-scores everything at once.
 */
export default function IntelligenceHub({ initialTicker = "NVDA" }: { initialTicker?: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  return (
    <div className="tt-split">
      <MarketIntelPanel ticker={ticker} onTickerChange={setTicker} />
      <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <PeersPanel ticker={ticker} />
        <WorldRadar />
      </div>
    </div>
  );
}
