import type { ReactNode } from "react";
import AppShell from "@/components/app/AppShell";

/**
 * Product routes (the app users pay for) render inside the dark desktop shell.
 * The public site (/, /buy, /blog, legal) keeps the light marketing theme.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
