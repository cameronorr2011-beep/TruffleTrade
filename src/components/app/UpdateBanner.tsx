"use client";

/**
 * Desktop update surface — always visible, zero-action by default.
 *
 * Talks to the Electron preload bridge (window.truffleUpdates). On the plain
 * web the bridge is undefined and this renders nothing.
 *
 * States:
 *   idle/checking/up-to-date → a quiet status chip in the topbar ("Up to date")
 *   downloading              → chip shows live %, expanding to a progress bar
 *   downloaded               → chip becomes a gold "Update ready" button that
 *                              expands: "what's new" + Restart now + dismiss
 *   error                    → chip shows "!" ; expand for the retry button
 *
 * Updates install themselves on quit regardless — the chip is for users who
 * want to switch immediately or want proof the system is alive.
 */
import { useEffect, useState } from "react";

type UpdateState = {
  status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "error";
  info: { version: string | null } | null;
  progress: number;
  error: string | null;
  checkedAt: number;
};

declare global {
  interface Window {
    truffleUpdates?: {
      getState: () => Promise<UpdateState>;
      install: () => Promise<void>;
      onState: (cb: (s: UpdateState) => void) => () => void;
    };
  }
}

function ago(ts: number): string {
  if (!ts) return "";
  const m = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const bridge = window.truffleUpdates;
    if (!bridge) return; // plain web — nothing to do
    let alive = true;
    bridge.getState().then((s) => {
      if (alive) setState(s);
    });
    const off = bridge.onState((s) => alive && setState(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!state) return null; // web, or bridge not mounted yet

  const { status } = state;
  const ready = status === "downloaded";
  const downloading = status === "downloading";
  const errored = status === "error";

  // Base chip label/class
  let label = "Up to date";
  let cls = "tt-upd";
  if (status === "checking") (label = "Checking…"), (cls = "tt-upd tt-upd-wait");
  if (downloading) (label = `Updating ${state.progress}%`), (cls = "tt-upd tt-upd-wait");
  if (ready) (label = "Update ready"), (cls = "tt-upd tt-upd-ready");
  if (errored) (label = "Update failed"), (cls = "tt-upd tt-upd-err");

  const popOpen = open || (ready && !dismissed);

  return (
    <span className="tt-upd-wrap">
      <button
        type="button"
        className={`${cls} ${popOpen ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="TruffleTrade updates"
        aria-expanded={popOpen}
      >
        {ready && <span className="tt-upd-dot" aria-hidden />}
        {label}
      </button>

      {popOpen && (
        <div className="tt-upd-pop" role="dialog" aria-label="Update details">
          {ready ? (
            <>
              <strong>TruffleTrade {state.info?.version ? `v${state.info.version}` : "update"} is ready</strong>
              <p>Downloaded and verified. It installs automatically next time you close the app — or restart right now:</p>
              <div className="tt-upd-actions">
                <button type="button" className="tt-upd-restart" onClick={() => window.truffleUpdates?.install()}>
                  Restart now
                </button>
                <button type="button" className="tt-upd-quiet" onClick={() => { setDismissed(true); setOpen(false); }}>
                  I&apos;ll close it myself later
                </button>
              </div>
            </>
          ) : downloading ? (
            <>
              <strong>Downloading TruffleTrade {state.info?.version ? `v${state.info.version}` : "update"}</strong>
              <div className="tt-upd-bar" aria-hidden>
                <i style={{ width: `${Math.max(4, state.progress)}%` }} />
              </div>
              <p>{state.progress}% — installs automatically when you quit. You can keep working.</p>
            </>
          ) : errored ? (
            <>
              <strong>Update check failed</strong>
              <p>{state.error ?? "Network or GitHub was unreachable. Updates will retry automatically."}</p>
              <p className="tt-upd-fine">Last check: {state.checkedAt ? ago(state.checkedAt) : "never"}</p>
            </>
          ) : (
            <>
              <strong>You&apos;re up to date</strong>
              <p>TruffleTrade checks GitHub every 30 minutes and installs new versions automatically when you close the app.</p>
              <p className="tt-upd-fine">Last check: {state.checkedAt ? ago(state.checkedAt) : "moments ago"}</p>
            </>
          )}
        </div>
      )}
    </span>
  );
}
