import type { ReactNode } from "react";
import AppShell from "@/components/app/AppShell";

/**
 * Product routes (the app users pay for) render inside the dark desktop shell.
 * The shell is a pure product surface: no marketing links, no purchase CTAs.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
