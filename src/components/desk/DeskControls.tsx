"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function DeskControls({ halted }: { halted: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  async function call(path: string, label: string) {
    setBusy(label);
    setMsg("");
    try {
      const res = await fetch(path, { method: "POST" });
      const j = (await res.json()) as { ok?: boolean; error?: string; result?: unknown };
      setMsg(j.ok ? `${label}: done` : `${label} failed: ${j.error ?? res.status}`);
      startTransition(() => router.refresh());
    } catch (err) {
      setMsg(`${label} failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-3">
      <button
        type="button"
        onClick={() => call("/api/cycle", "cycle")}
        disabled={busy !== null || pending}
        className="rounded-lg bg-truffle-500 px-5 py-3 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-white transition-colors hover:bg-truffle-600 disabled:opacity-40"
      >
        {busy === "cycle" ? "Council in session…" : "Run one cycle now"}
      </button>
      <button
        type="button"
        onClick={() => call("/api/halt", "halt")}
        disabled={busy !== null || pending || halted}
        className="rounded-lg border border-blood/50 px-5 py-3 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-blood transition-colors hover:bg-blood/10 disabled:opacity-40"
      >
        {halted ? "Desk halted" : "Halt desk (flatten & stop)"}
      </button>
      {msg ? <p className="font-mono text-[0.66rem] text-bone-soft">{msg}</p> : null}
      <p className="mt-1 text-[0.72rem] leading-relaxed text-bone-soft">
        The engine runs on its own process — these controls trigger the same audited cycle the
        scheduler uses. Halting flattens any position and the desk stays flat until you restart it.
      </p>
    </div>
  );
}
