import type { Metadata } from "next";
import type { ReactNode } from "react";

// The personal hub is a logged-in surface, not search content.
export const metadata: Metadata = {
  title: "My Market Intelligence — TruffleTrade",
  robots: { index: false, follow: false },
};

/**
 * My Intelligence layout — wraps the hub in `.mi-light`, re-theming the
 * content area to the white palette. The dark app shell (sidebar, topbar)
 * stays; only this content area flips. See mi-light rules in app.css.
 */
export default function IntelligenceLayout({ children }: { children: ReactNode }) {
  return <div className="mi-light">{children}</div>;
}
