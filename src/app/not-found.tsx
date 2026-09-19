import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/site/Logo";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="tt-site flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <Logo size={64} className="animate-float" />
      <span className="eyebrow mt-8">404</span>
      <h1 className="mt-4 text-[clamp(2rem,4.6vw,3.2rem)] font-extrabold leading-[1.05] tracking-[-1.6px] text-ink">
        Nothing here — <span className="text-gold">truffles stay buried.</span>
      </h1>
      <p className="mt-3 max-w-md text-[0.95rem] leading-relaxed text-bone-soft">
        The page you&apos;re after doesn&apos;t exist or has moved.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="btn-primary !px-6 !py-3">
          Back to the homepage
        </Link>
        <Link href="/buy" className="btn-secondary !px-6 !py-3">
          Get access
        </Link>
      </div>
    </div>
  );
}
