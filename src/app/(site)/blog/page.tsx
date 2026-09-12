import type { Metadata } from "next";
import Link from "next/link";
import { POSTS } from "@/data/blog/posts";

export const metadata: Metadata = {
  title: "Blog",
  description: "How TruffleTrade works: adversarial analysis, self-training memory, and honest bitcoin billing.",
};

export default function BlogIndex() {
  return (
    <div className="mx-auto max-w-[900px] px-5 py-20 sm:px-8">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.32em] text-truffle-300">Field notes</span>
      <h1 className="font-display mt-5 text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-[1.05] text-bone">
        The TruffleTrade blog
      </h1>
      <p className="mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-bone-soft">
        How the system works, why it&apos;s built this way, and what we refuse to pretend.
      </p>
      <div className="mt-12 space-y-5">
        {POSTS.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="card group block p-6 transition-colors hover:border-forest/35">
            <div className="flex flex-wrap items-center gap-3 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-faint">
              <span>{new Date(p.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
              <span aria-hidden>·</span>
              <span>{p.minutes} min read</span>
              {p.tags.map((t) => (
                <span key={t} className="rounded-full border border-soil-500 px-2.5 py-0.5 text-truffle-300">
                  {t}
                </span>
              ))}
            </div>
            <h2 className="font-display mt-3 text-[1.5rem] font-semibold leading-snug text-bone group-hover:text-truffle-600">
              {p.title}
            </h2>
            <p className="mt-2 text-[0.92rem] leading-relaxed text-bone-soft">{p.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
