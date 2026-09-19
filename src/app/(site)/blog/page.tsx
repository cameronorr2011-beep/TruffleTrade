import type { Metadata } from "next";
import Link from "next/link";
import { POSTS } from "@/data/blog/posts";
import { JsonLd } from "@/components/site/JsonLd";
import { SITE_NAME, SITE_URL, absoluteUrl, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Blog — field notes",
  description:
    "How TruffleTrade works: adversarial AI analysis, self-training memory, digital twins, federated learning, and honest bitcoin billing.",
  openGraph: {
    title: "The TruffleTrade blog",
    description: "Adversarial AI analysis, self-training memory, and honest bitcoin billing — explained.",
    url: "/blog",
  },
  alternates: { canonical: "/blog", types: { "application/rss+xml": `${SITE_URL}/feed.xml` } },
};

const blogJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${SITE_URL}/blog#blog`,
    name: `${SITE_NAME} blog — field notes`,
    url: absoluteUrl("/blog"),
    publisher: { "@id": `${SITE_URL}/#organization` },
    blogPost: POSTS.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: absoluteUrl(`/blog/${p.slug}`),
      datePublished: p.date,
    })),
  },
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
  ]),
];

export default function BlogIndex() {
  const posts = [...POSTS].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  return (
    <div className="mx-auto max-w-[900px] px-5 py-20 sm:px-8">
      <JsonLd data={blogJsonLd} />
      <span className="eyebrow">Field notes</span>
      <h1 className="font-display mt-5 text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold leading-[1.05] tracking-[-1.8px] text-bone">
        The TruffleTrade <span className="text-gold">blog</span>
      </h1>
      <p className="mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-bone-soft">
        How the system works, why it&apos;s built this way, and what we refuse to pretend.
      </p>
      <div className="mt-12 space-y-5">
        {posts.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="card group block p-6">
            <div className="flex flex-wrap items-center gap-3 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-faint">
              <span>{new Date(p.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
              <span aria-hidden>·</span>
              <span>{p.minutes} min read</span>
              {p.tags.map((t) => (
                <span key={t} className="rounded-full border border-truffle-400/25 bg-truffle-200/60 px-2.5 py-0.5 text-truffle-300">
                  {t}
                </span>
              ))}
            </div>
            <h2 className="font-display mt-3 text-[1.5rem] font-semibold leading-snug text-bone transition-colors group-hover:text-truffle-600">
              {p.title}
            </h2>
            <p className="mt-2 text-[0.92rem] leading-relaxed text-bone-soft">{p.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
