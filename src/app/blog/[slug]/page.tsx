import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POSTS, getPost } from "@/data/blog/posts";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Post not found" };
  return { title: post.title, description: post.description };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const others = POSTS.filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <article className="mx-auto max-w-[760px] px-5 py-20 sm:px-8">
      <Link href="/blog" className="font-mono text-[0.66rem] uppercase tracking-[0.2em] text-bone/45 hover:text-bone">
        ← All posts
      </Link>
      <div className="mt-8 flex flex-wrap items-center gap-3 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-bone/40">
        <span>{new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
        <span aria-hidden>·</span>
        <span>{post.minutes} min read</span>
      </div>
      <h1 className="font-display mt-4 text-[clamp(2rem,4.6vw,3.2rem)] font-semibold leading-[1.08] text-bone">
        {post.title}
      </h1>
      <p className="mt-4 text-[1.02rem] leading-relaxed text-bone/60">{post.description}</p>

      <div className="mt-10 space-y-8">
        {post.body.map((section, i) => (
          <section key={i}>
            {section.heading && (
              <h2 className="font-display text-[1.45rem] font-semibold text-truffle-200">{section.heading}</h2>
            )}
            {section.paragraphs.map((p, j) => (
              <p key={j} className="mt-3 text-[0.98rem] leading-[1.75] text-bone/70">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>

      <div className="mt-14 border-t border-truffle-400/10 pt-8">
        <h3 className="font-mono text-[0.66rem] uppercase tracking-[0.24em] text-bone/45">Keep reading</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {others.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="card block p-5 hover:border-truffle-400/40">
              <p className="font-display text-[1.1rem] font-semibold text-bone">{p.title}</p>
              <p className="mt-2 text-[0.82rem] leading-relaxed text-bone/50">{p.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
