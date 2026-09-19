"use client";

/**
 * Persistent desktop update banner.
 *
 * Talks to the Electron preload bridge (window.truffleUpdates). On the plain
 * web the bridge is undefined and this component renders nothing — updating
 * the website is Vercel's job, not the browser's.
 *
 * States surfaced to the user:
 *   downloading → thin progress strip (never blocks work)
 *   downloaded  → full-width banner: what's new + "Restart now" (persistent until used)
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

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState | null>(null);

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

  if (!state) return null;

  if (state.status === "downloading") {
    return (
      <div className="tt-update-strip" role="status">
        <span className="tt-update-strip-label">
          Updating TruffleTrade{state.info?.version ? ` → v${state.info.version}` : ""} · {state.progress}%
        </span>
        <span className="tt-update-strip-bar" aria-hidden>
          <i style={{ width: `${Math.max(4, state.progress)}%` }} />
        </span>
      </div>
    );
  }

  // downloaded — persistent until the user restarts (auto-installs on quit too)
  return (
    <div className="tt-update-banner" role="alert">
      <span className="tt-update-dot" aria-hidden />
      <strong>TruffleTrade {state.info?.version ? `v${state.info.version}` : "an update"} is ready</strong>
      <span className="tt-update-copy">New features are downloaded. Restart to switch — takes a few seconds.</span>
      <button type="button" className="tt-update-restart" onClick={() => window.truffleUpdates?.install()}>
        Restart now
      </button>
    </div>
  );
}
