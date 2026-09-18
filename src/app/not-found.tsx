import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <span className="font-mono text-[0.66rem] uppercase tracking-[0.32em] text-truffle-300">404</span>
      <h1 className="mt-4 text-[clamp(2rem,4.6vw,3.2rem)] font-extrabold leading-[1.05] tracking-[-1.6px] text-ink">
        Nothing here — truffles stay buried.
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
