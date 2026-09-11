"use client";

import { useEffect, useState } from "react";

const COOKIE_KEY = "tt-cookie-consent";

type Choice = "all" | "essential";

/**
 * Cookie consent banner (GDPR/CCPA-friendly, no tracking third parties by
 * default). Essential = strictly-necessary only (consent record, session).
 * All = + anonymous product analytics stored locally. Choice is persisted in
 * localStorage AND a cookie so the server never needs consent to remember it.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(COOKIE_KEY)) setVisible(true);
    } catch {
      // storage blocked — do not nag, just proceed with essential-only
    }
  }, []);

  const decide = (choice: Choice) => {
    try {
      localStorage.setItem(COOKIE_KEY, choice);
      document.cookie = `${COOKIE_KEY}=${choice}; path=/; max-age=${180 * 24 * 3600}; samesite=lax`;
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-[95] sm:left-auto sm:right-5 sm:max-w-md"
    >
      <div className="card p-5 shadow-2xl shadow-black/60">
        <h2 className="font-display text-[1.05rem] font-semibold text-bone">A word about cookies</h2>
        <p className="mt-2 text-[0.82rem] leading-relaxed text-bone/60">
          We use strictly-necessary cookies to run this site (consent, purchase session). Optional analytics stay
          anonymous and on-device unless you allow them. No ad networks, no cross-site tracking, ever. See our{" "}
          <a href="/privacy" className="text-truffle-300 underline decoration-truffle-400/40 underline-offset-2">
            Privacy Policy
          </a>
          .
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => decide("all")}
            className="rounded-full bg-truffle-500 px-4 py-2 font-mono text-[0.66rem] uppercase tracking-[0.18em] text-void transition-colors hover:bg-truffle-400"
          >
            Accept all
          </button>
          <button
            onClick={() => decide("essential")}
            className="rounded-full border border-bone/25 px-4 py-2 font-mono text-[0.66rem] uppercase tracking-[0.18em] text-bone/75 transition-colors hover:border-bone/50 hover:text-bone"
          >
            Essential only
          </button>
        </div>
      </div>
    </div>
  );
}
