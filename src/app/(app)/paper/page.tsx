"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/accessCodeClient";

/**
 * PAPER TRADING — SIMULATED ONLY. NOT REAL EXECUTION. (spec §0/§59)
 * Every element on this page operates on a simulated account; the banner and
 * per-position "PAPER" chips keep that status impossible to mistake.
 * Prices are live market marks; fills apply documented fees and slippage;
 * a deterministic risk engine gates every order before the simulator runs.
 */

type Position = { ticker: string; quantity: number; avgCostUsd: number; lastPriceUsd: number | null };

type Portfolio = {
  ok: boolean;
  simulated: boolean;
  disclaimer: string;
  assumptions: { feeBps?: number; slippageBps?: number; feeModel?: string; slippageModel?: string };
  account: {
    cashUsd: number;
    positionsValueUsd: number;
    portfolioValueUsd: number;
    realizedPnlUsd: number;
    unrealizedPnlUsd: number;
    peakValueUsd: number;
    warnings: string[];
  };
  positions: Position[];
  orders: { id: number; ticker: string; side: string; type: string; quantity: number; status: string; reason: string | null; createdAt: number }[];
  fills: { id: number; ticker: string; side: string; quantity: number; priceUsd: number; feeUsd: number; realizedPnlUsd: number; ts: number }[];
};

const usd = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits });

export default function PaperPage() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("10");
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/paper", { headers: authHeaders(), cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setErr(j.code === "SUBSCRIPTION_REQUIRED" ? "Subscription required — add your access code on the Research page." : j.error ?? `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setErr(null);
      setData(j);
    } catch {
      setErr("Could not reach the paper engine — check your connection and retry.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch("/api/paper/order", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ticker: ticker.trim().toUpperCase(), side, quantity: Number(qty), type: "market" }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        const f = j.fill;
        setFlash(`SIMULATED FILL: ${f.side.toUpperCase()} ${f.quantity} ${f.ticker} @ ${usd(f.priceUsd)} (fee ${usd(f.feeUsd)}) — price source ${f.priceSource} as of ${new Date(f.priceAsOf).toLocaleTimeString()}`);
        setTicker("");
        await load();
      } else {
        setFlash(j.error ?? "Order rejected.");
      }
    } catch {
      setFlash("Network error — nothing simulated.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="tt-main">
      <header className="tt-pagehead">
        <div>
          <p className="tt-kicker">Simulator</p>
          <h1>Paper portfolio</h1>
          <p className="tt-sub">Simulated execution against live market marks. Fees and slippage apply. Nothing here touches a real broker.</p>
        </div>
        <span className="tt-pill tt-pill-warn" role="status">PAPER TRADING · SIMULATED · NOT REAL EXECUTION</span>
      </header>

      {err && (
        <div className="tt-card tt-error" role="alert">
          <strong>Unavailable:</strong> {err}
        </div>
      )}

      {data && (
        <>
          <section className="tt-grid-4" aria-label="Account summary">
            <div className="tt-card tt-stat">
              <p className="tt-label">Portfolio value</p>
              <p className="tt-big">{usd(data.account.portfolioValueUsd)}</p>
            </div>
            <div className="tt-card tt-stat">
              <p className="tt-label">Cash</p>
              <p className="tt-big">{usd(data.account.cashUsd)}</p>
            </div>
            <div className="tt-card tt-stat">
              <p className={`tt-big ${data.account.unrealizedPnlUsd >= 0 ? "tt-pos" : "tt-neg"}`}>{usd(data.account.unrealizedPnlUsd)}</p>
              <p className="tt-label">Unrealized P/L</p>
            </div>
            <div className="tt-card tt-stat">
              <p className={`tt-big ${data.account.realizedPnlUsd >= 0 ? "tt-pos" : "tt-neg"}`}>{usd(data.account.realizedPnlUsd)}</p>
              <p className="tt-label">Realized P/L (closed trades)</p>
            </div>
          </section>

          {(data.account.warnings?.length ?? 0) > 0 && (
            <div className="tt-card tt-warn" role="note">
              {data.account.warnings.map((w) => (
                <p key={w}>⚠ {w}</p>
              ))}
            </div>
          )}

          <section className="tt-split">
            <div className="tt-card">
              <h2>Positions</h2>
              {data.positions.length === 0 ? (
                <p className="tt-empty">No open positions. Place a simulated order to begin — nothing is at risk, and nothing is real.</p>
              ) : (
                <table className="tt-table">
                  <thead>
                    <tr><th>Symbol</th><th>Qty</th><th>Avg cost</th><th>Last</th><th>Value</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {data.positions.map((p) => (
                      <tr key={p.ticker}>
                        <td><strong>{p.ticker}</strong></td>
                        <td>{p.quantity}</td>
                        <td>{usd(p.avgCostUsd)}</td>
                        <td>{p.lastPriceUsd != null ? usd(p.lastPriceUsd) : "—"}</td>
                        <td>{usd(p.avgCostUsd * p.quantity)}</td>
                        <td><span className="tt-pill tt-pill-warn">PAPER</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <form className="tt-card tt-orderform" onSubmit={submit} aria-label="Place simulated order">
              <h2>Simulated order</h2>
              <p className="tt-hint">Market order at the live mark. The risk engine validates first: position caps, exposure caps, kill switch.</p>
              <label>
                Symbol
                <input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="AAPL" required maxLength={10} aria-required />
              </label>
              <label>
                Side
                <select value={side} onChange={(e) => setSide(e.target.value as "buy" | "sell")}>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </label>
              <label>
                Quantity
                <input type="number" min="0.0001" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required aria-required />
              </label>
              <button className="tt-btn" disabled={busy || !ticker.trim()} type="submit">
                {busy ? "Routing…" : `Simulate ${side}`}
              </button>
              {flash && <p className="tt-flash" role="status">{flash}</p>}
              <p className="tt-hint">
                Simulation assumptions: fee {data.assumptions.feeBps ?? 5} bps ({data.assumptions.feeModel ?? "flat_bps"}), slippage {data.assumptions.slippageBps ?? 10} bps adverse ({data.assumptions.slippageModel ?? "fixed_bps_adverse"}). Long-only.
              </p>
            </form>
          </section>

          <section className="tt-card">
            <h2>Order history</h2>
            {data.orders.length === 0 ? (
              <p className="tt-empty">No orders yet.</p>
            ) : (
              <table className="tt-table">
                <thead>
                  <tr><th>#</th><th>Symbol</th><th>Side</th><th>Type</th><th>Qty</th><th>Status</th><th>When</th></tr>
                </thead>
                <tbody>
                  {data.orders.slice(0, 15).map((o) => (
                    <tr key={o.id}>
                      <td>{o.id}</td>
                      <td>{o.ticker}</td>
                      <td className={o.side === "buy" ? "tt-pos" : "tt-neg"}>{o.side}</td>
                      <td>{o.type}</td>
                      <td>{o.quantity}</td>
                      <td>
                        <span className={`tt-pill ${o.status === "filled" ? "tt-pill-ok" : o.status === "rejected" ? "tt-pill-bad" : ""}`}>{o.status}</span>
                        {o.reason && <span className="tt-reason"> — {o.reason}</span>}
                      </td>
                      <td>{new Date(o.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="tt-footnote">
            {data.disclaimer} Simulated performance never guarantees future results.
          </p>
        </>
      )}
    </main>
  );
}
