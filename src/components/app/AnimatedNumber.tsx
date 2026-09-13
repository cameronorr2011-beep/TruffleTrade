"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AnimatedNumber — interpolates displayed value toward the target (the
 * "231.42 → 231.47" glide) and flashes directional color for ~480ms on change.
 * Layout-stable: tabular-nums. Reduced-motion users get instant swap, no glow.
 */
export default function AnimatedNumber({
  value,
  format = (n: number) => n.toFixed(2),
  className = "",
}: {
  value: number | null;
  format?: (n: number) => string;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<"" | "tt-flash-up" | "tt-flash-down">("");
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (value == null || reduced) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    const from = fromRef.current ?? value;
    const delta = value - from;
    if (Math.abs(delta) < 1e-9) {
      setShown(value);
      return;
    }
    setFlash(delta > 0 ? "tt-flash-up" : "tt-flash-down");
    const t0 = performance.now();
    const dur = Math.min(600, 140 + Math.abs(delta) * 40); // bigger moves glide faster
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(from + delta * eased);
      if (k < 1) rafRef.current = requestAnimationFrame(step);
      else {
        fromRef.current = value;
        setShown(value);
        setTimeout(() => setFlash(""), 550);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return (
    <span className={`tt-num ${flash} ${className}`}>
      {shown == null ? "—" : format(shown)}
    </span>
  );
}
