import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POSTS, getPost } from "@/data/blog/posts";
import { JsonLd } from "@/components/site/JsonLd";
import { SITE_NAME, SITE_URL, absoluteUrl, breadcrumbJsonLd } from "@/lib/seo";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Post not found", robots: { index: false, follow: false } };
  const image = `/blog/${post.slug}/og`;
  return {
    title: post.title,
    description: post.description,
    keywords: post.tags,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      url: `/blog/${post.slug}`,
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      modifiedTime: post.date,
      section: "Field notes",
      tags: post.tags,
      authors: [SITE_NAME],
      images: [{ url: image, width: 1200, height: 630, alt: post.title }],
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description, images: [image] },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const others = POSTS.filter((p) => p.slug !== slug).slice(0, 2);

  const wordCount = post.body.reduce((n, s) => n + s.paragraphs.join(" ").split(/\s+/).length, 0);

  // Article rich result + breadcrumbs up to this post.
  const postJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      dateModified: post.date,
      keywords: post.tags.join(", "),
      wordCount,
      timeRequired: `PT${post.minutes}M`,
      inLanguage: "en-US",
      isAccessibleForFree: true,
      author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      publisher: {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: absoluteUrl("/icon-512.png"), width: 512, height: 512 },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(`/blog/${post.slug}`) },
      image: absoluteUrl(`/blog/${post.slug}/og`),
    },
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Blog", path: "/blog" },
      { name: post.title, path: `/blog/${post.slug}` },
    ]),
  ];

  return (
    <article className="mx-auto max-w-[760px] px-5 py-20 sm:px-8">
      <JsonLd data={postJsonLd} />
      <nav aria-label="Breadcrumb">
        <Link href="/blog" className="font-mono text-[0.66rem] uppercase tracking-[0.2em] text-faint transition-colors hover:text-truffle-400">
          ← All posts
        </Link>
      </nav>
      <div className="mt-8 flex flex-wrap items-center gap-3 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-faint">
        <time dateTime={post.date}>
          {new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </time>
        <span aria-hidden>·</span>
        <span>{post.minutes} min read</span>
        {post.tags.map((t) => (
          <span key={t} className="rounded-full border border-truffle-400/25 bg-truffle-200/60 px-2.5 py-0.5 text-truffle-300">
            {t}
          </span>
        ))}
      </div>
      <h1 className="font-display mt-4 text-[clamp(2rem,4.6vw,3.2rem)] font-extrabold leading-[1.08] tracking-[-1.6px] text-ink">
        {post.title}
      </h1>
      <p className="mt-4 text-[1.02rem] leading-relaxed text-bone-soft">{post.description}</p>

      <div className="mt-10 space-y-8">
        {post.body.map((section, i) => (
          <section key={i}>
            {section.heading && (
              <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.5px] text-truffle-600">{section.heading}</h2>
            )}
            {section.paragraphs.map((p, j) => (
              <p key={j} className="mt-3 text-[0.98rem] leading-[1.75] text-bone-soft">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>

      <div className="mt-14 border-t border-soil-600 pt-8">
        <h3 className="font-mono text-[0.66rem] uppercase tracking-[0.24em] text-faint">Keep reading</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {others.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="card block p-5">
              <p className="font-display text-[1.1rem] font-semibold text-ink">{p.title}</p>
              <p className="mt-2 text-[0.82rem] leading-relaxed text-bone-soft">{p.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
