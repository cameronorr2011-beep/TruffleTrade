import type { Metadata } from "next";
import type { ReactNode } from "react";
import AppShell from "@/components/app/AppShell";

// The product shell is a logged-in surface, not search content.
export const metadata: Metadata = {
  title: { default: "TruffleTrade", template: "%s" },
  robots: { index: false, follow: false },
};

/**
 * Product routes (the app users pay for) render inside the dark desktop shell.
 * The shell is a pure product surface: no marketing links, no purchase CTAs.
 *
 * My Intelligence is the one light surface: the /intelligence layout wraps its
 * children in `.mi-light`, which re-themes the content area to white — the
 * deliberate visual opposite of the dark AI Analyst.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
