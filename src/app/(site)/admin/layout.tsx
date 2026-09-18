import type { Metadata } from "next";
import type { ReactNode } from "react";

// The admin console is operator-only — never index it. (Client components
// can't export metadata themselves, hence this wrapper layout.)
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
