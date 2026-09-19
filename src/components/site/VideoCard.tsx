"use client";

import { useRef, useState } from "react";

/**
 * The 30s brand film, rendered frame-by-frame (scripts/render-short.mjs).
 * Autoplays muted + looping (browser-safe); tap toggles sound. A muted
 * <video> with playsInline autoplays on every mobile browser without JS.
 */
export default function VideoCard() {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);

  const toggleMute = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted) void v.play();
  };

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-4 rounded-[2rem] opacity-60 blur-2xl"
        style={{ background: "radial-gradient(closest-side, rgba(223,174,76,0.28), transparent)" }}
      />
      <video
        ref={ref}
        className="relative w-[248px] cursor-pointer rounded-[1.6rem] border border-truffle-400/20 shadow-2xl shadow-black/60 sm:w-[280px]"
        src="/video/truffletrade-short.mp4"
        poster="/images/council-sim-dark.svg"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="TruffleTrade brand film: nine analysts, a red team, and a memory that keeps score"
        onClick={toggleMute}
      />
      <button
        onClick={toggleMute}
        className="absolute bottom-3 right-3 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur transition-colors hover:border-truffle-400/50 hover:bg-black/80"
      >
        {muted ? "🔊 Sound" : "🔇 Mute"}
      </button>
    </div>
  );
}
