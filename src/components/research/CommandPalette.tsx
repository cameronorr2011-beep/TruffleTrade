"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Command {
  id: string;
  label: string;
  hint?: string;
  action: (router: ReturnType<typeof useRouter>, arg?: string) => void;
  needsArg?: boolean;
  argPlaceholder?: string;
}

const COMMANDS: Command[] = [
  {
    id: "analyze",
    label: "Analyze security",
    hint: "Run the full council investigation",
    needsArg: true,
    argPlaceholder: "TICKER e.g. NVDA",
    action: (router, arg) => router.push(`/research?ticker=${encodeURIComponent((arg ?? "").toUpperCase())}&autorun=1`),
  },
  {
    id: "open-company",
    label: "Open company dossier",
    needsArg: true,
    argPlaceholder: "TICKER e.g. AAPL",
    action: (router, arg) => router.push(`/company/${encodeURIComponent((arg ?? "").toUpperCase())}`),
  },
  {
    id: "compare",
    label: "Compare securities",
    hint: "NVDA vs AMD",
    needsArg: true,
    argPlaceholder: "TICKER vs TICKER",
    action: (router, arg) => router.push(`/compare?t=${encodeURIComponent(arg ?? "")}`),
  },
  { id: "markets", label: "View markets", action: (r) => r.push("/markets") },
  { id: "watchlist", label: "Open watchlist", action: (r) => r.push("/watchlist") },
  { id: "runs", label: "Search research runs", action: (r) => r.push("/research") },
  { id: "terminal", label: "Open research terminal", action: (r) => r.push("/research") },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Command | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setPending(null);
        setQuery("");
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!pending) return COMMANDS.filter((c) => !q || c.label.toLowerCase().includes(q));
    return [];
  }, [query, pending]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-void/80 pt-[14vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div className="card w-full max-w-xl overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        {pending ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              pending.action(router, query.trim());
              setOpen(false);
            }}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={pending.argPlaceholder}
              className="w-full bg-transparent px-5 py-4 font-mono text-[0.95rem] text-bone outline-none placeholder:text-bone/30"
            />
            <div className="border-t border-pit-300/10 px-5 py-2.5 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-bone/40">
              Enter to run · Esc to cancel
            </div>
          </form>
        ) : (
          <>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command… (Ctrl+K)"
              className="w-full bg-transparent px-5 py-4 font-mono text-[0.95rem] text-bone outline-none placeholder:text-bone/30"
            />
            <ul className="max-h-[50vh] overflow-y-auto border-t border-pit-300/10">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      if (c.needsArg) {
                        setPending(c);
                        setQuery("");
                      } else {
                        c.action(router);
                        setOpen(false);
                      }
                    }}
                    className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-pit-800/40"
                  >
                    <span className="text-[0.9rem] text-bone/85">{c.label}</span>
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-bone/35">
                      {c.hint ?? "Enter"}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-5 py-4 font-mono text-[0.7rem] text-bone/40">No matching command</li>
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
