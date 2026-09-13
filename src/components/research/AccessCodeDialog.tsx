"use client";

import { useEffect, useRef, useState } from "react";

/**
 * In-app access-code dialog (shared). Electron does not support
 * window.prompt(), so the code is collected here — styled to the dark
 * workspace — and stored via the localStorage helper.
 */
export default function AccessCodeDialog({
  open,
  onSubmit,
  onCancel,
  title = "Access code required",
  blurb = "This runs on your subscription. Paste the access code from your purchase — it stays on this device.",
}: {
  open: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
  title?: string;
  blurb?: string;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue("");
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;
  return (
    <div className="tt-modal-scrim" role="dialog" aria-modal="true" aria-label="Access code required">
      <div className="tt-modal">
        <h3>{title}</h3>
        <p>{blurb}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = value.trim().toUpperCase();
            if (v) onSubmit(v);
          }}
        >
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            placeholder="TT-XXXX-XXXX-XXXX-XXXX"
            spellCheck={false}
            aria-label="Access code"
          />
          <div className="tt-modal-actions">
            <button type="button" className="tt-btn tt-btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="tt-btn tt-btn-primary" disabled={!value.trim()}>
              Save &amp; continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
