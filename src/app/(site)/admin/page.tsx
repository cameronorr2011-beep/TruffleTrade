"use client";

import { useCallback, useEffect, useState } from "react";

interface OrderRow {
  id: string;
  status: string;
  createdTs: number;
  paidTs: number | null;
  hasCode: boolean;
}

type Tab = "orders" | "code";

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [actionCode, setActionCode] = useState("");
  const [actionDays, setActionDays] = useState(30);
  const [actionResult, setActionResult] = useState<string | null>(null);

  useEffect(() => {
    // Token stays in sessionStorage only — never persisted server-side.
    try {
      const saved = sessionStorage.getItem("tt-admin-token");
      if (saved) {
        setToken(saved);
        setAuthed(true);
      }
    } catch {
      // storage unavailable
    }
  }, []);

  const loadOrders = useCallback(
    async (t: string) => {
      setError(null);
      const res = await fetch("/api/admin/orders", { headers: { "x-admin-token": t } });
      if (res.status === 401) {
        setError("Invalid admin token");
        setAuthed(false);
        sessionStorage.removeItem("tt-admin-token");
        return;
      }
      const j = (await res.json()) as { ok: boolean; orders?: OrderRow[] };
      if (j.ok && j.orders) setOrders(j.orders);
    },
    [],
  );

  useEffect(() => {
    if (authed) void loadOrders(token);
  }, [authed, token, loadOrders]);

  const login = () => {
    sessionStorage.setItem("tt-admin-token", token);
    setAuthed(true);
  };

  const approve = async (orderId: string) => {
    setBusy(orderId);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "x-admin-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action: "approve" }),
      });
      const j = (await res.json()) as { ok: boolean; accessCode?: string; error?: string };
      if (!j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      await loadOrders(token);
      if (j.accessCode) {
        setIssuedCode(j.accessCode);
        setTab("code");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const runAction = async (action: "extend" | "revoke" | "issue") => {
    setBusy(action);
    setError(null);
    setActionResult(null);
    try {
      const body: Record<string, unknown> = { action };
      if (action !== "issue") {
        body.code = actionCode;
        if (action === "extend") body.days = actionDays;
      }
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "x-admin-token": token, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok: boolean; code?: string; expiresTs?: number; error?: string };
      if (!j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (action === "issue" && j.code) {
        setIssuedCode(j.code);
        setActionResult("New code issued — show it to the customer now (shown once).");
      } else if (action === "extend") {
        setActionResult(`Code extended. New expiry: ${j.expiresTs ? new Date(j.expiresTs).toLocaleString() : "?"}`);
      } else {
        setActionResult("Code revoked.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!authed) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 sm:px-8">
        <h1 className="font-display text-2xl font-semibold text-ink">TruffleTrade Admin</h1>
        <p className="mt-2 text-sm text-bone-soft">
          Operator access only. Enter the ADMIN_TOKEN to manage orders and access codes.
        </p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()}
          placeholder="ADMIN_TOKEN"
          className="mt-6 w-full rounded-lg border border-soil-500  px-4 py-3 font-mono text-sm text-ink outline-none focus:border-forest/55"
        />
        {error && <p className="mt-3 text-sm text-blood">{error}</p>}
        <button
          onClick={login}
          className="mt-4 w-full rounded-full bg-truffle-500 px-6 py-3 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-white hover:bg-truffle-600"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[1.8rem] font-semibold text-ink">TruffleTrade Admin</h1>
        <button
          onClick={() => {
            sessionStorage.removeItem("tt-admin-token");
            setAuthed(false);
            setToken("");
          }}
          className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-faint hover:text-ink"
        >
          Sign out
        </button>
      </div>

      <div className="mt-6 flex gap-2">
        {(["orders", "code"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 font-mono text-[0.64rem] uppercase tracking-[0.18em] transition-colors ${
              tab === t ? "bg-truffle-500 text-white" : "border border-soil-500 text-bone-soft hover:border-soil-500"
            }`}
          >
            {t === "orders" ? "Orders & payments" : "Access codes"}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-blood">{error}</p>}

      {tab === "orders" && (
        <div className="mt-6">
          <p className="text-[0.85rem] leading-relaxed text-bone-soft">
            When a buyer pays your Wallet of Satoshi address, their order appears here as{" "}
            <span className="font-mono text-truffle-300">pending</span>. Check your WoS app for the matching 1,000-sat
            deposit, then press Approve — their code appears on their screen instantly.
          </p>
          <div className="mt-4 space-y-2">
            {orders.length === 0 && <p className="text-sm text-faint">No orders yet.</p>}
            {orders.map((o) => (
              <div key={o.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-mono text-[0.78rem] text-bone-soft">{o.id}</p>
                  <p className="mt-0.5 font-mono text-[0.58rem] uppercase tracking-[0.18em] text-faint">
                    {new Date(o.createdTs).toLocaleString()} · {o.status}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 font-mono text-[0.56rem] uppercase tracking-[0.16em] ${
                      o.status === "issued"
                        ? "bg-jade/15 text-jade"
                        : o.status === "pending"
                          ? "bg-truffle-200/60 text-truffle-300"
                          : "bg-soil-700 text-bone-soft"
                    }`}
                  >
                    {o.status}
                  </span>
                  {o.status === "pending" && (
                    <button
                      onClick={() => approve(o.id)}
                      disabled={busy === o.id}
                      className="rounded-full bg-jade px-4 py-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-white hover:opacity-85 disabled:opacity-50"
                    >
                      {busy === o.id ? "…" : "Approve"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "code" && (
        <div className="mt-6 space-y-6">
          {issuedCode && (
            <div className="card border-jade/40 p-5">
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-jade">Issued code</p>
              <p className="mt-2 select-all font-mono text-[1.1rem] tracking-[0.12em] text-ink">{issuedCode}</p>
            </div>
          )}
          <div className="card p-5">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-truffle-300">Issue a comp code</p>
            <button
              onClick={() => runAction("issue")}
              disabled={busy === "issue"}
              className="mt-3 rounded-full bg-truffle-500 px-5 py-2.5 font-mono text-[0.64rem] uppercase tracking-[0.18em] text-white hover:bg-truffle-600 disabled:opacity-50"
            >
              {busy === "issue" ? "…" : "Generate new code"}
            </button>
          </div>
          <div className="card p-5">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-truffle-300">Extend or revoke</p>
            <input
              value={actionCode}
              onChange={(e) => setActionCode(e.target.value)}
              placeholder="TT-XXXX-XXXX-XXXX-XXXX"
              className="mt-3 w-full rounded-lg border border-soil-500  px-4 py-2.5 font-mono text-sm text-ink outline-none focus:border-forest/55"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-bone-soft">
                Days
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={actionDays}
                  onChange={(e) => setActionDays(Number(e.target.value))}
                  className="w-20 rounded-lg border border-soil-500  px-2 py-1.5 font-mono text-sm text-ink outline-none"
                />
              </label>
              <button
                onClick={() => runAction("extend")}
                disabled={busy === "extend" || !actionCode}
                className="rounded-full border border-forest/35 px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-truffle-300 hover:bg-truffle-200/60 disabled:opacity-40"
              >
                {busy === "extend" ? "…" : "Extend"}
              </button>
              <button
                onClick={() => runAction("revoke")}
                disabled={busy === "revoke" || !actionCode}
                className="rounded-full border border-blood/50 px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-blood hover:bg-blood/15 disabled:opacity-40"
              >
                {busy === "revoke" ? "…" : "Revoke"}
              </button>
            </div>
            {actionResult && <p className="mt-3 text-[0.85rem] text-jade">{actionResult}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
