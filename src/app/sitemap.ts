import type { MetadataRoute } from "next";
import { POSTS } from "@/data/blog/posts";
import { SITE_URL } from "@/lib/seo";

// Stable lastModified values: crawlers ignore a sitemap whose dates change on
// every build. Content pages track the newest post; legal pages their
// effective date.
const LEGAL_EFFECTIVE = new Date("2026-09-10");

export default function sitemap(): MetadataRoute.Sitemap {
  const newestPost = POSTS.reduce((d, p) => (new Date(p.date) > d ? new Date(p.date) : d), new Date(0));
  const marketing: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: newestPost,
      changeFrequency: "weekly",
      priority: 1,
      images: [`${SITE_URL}/images/terminal-mock.svg`, `${SITE_URL}/images/council-sim-dark.svg`, `${SITE_URL}/images/memory-graph.svg`],
    },
    { url: `${SITE_URL}/buy`, lastModified: newestPost, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/install`, lastModified: newestPost, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/blog`, lastModified: newestPost, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/terms`, lastModified: LEGAL_EFFECTIVE, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: LEGAL_EFFECTIVE, changeFrequency: "yearly", priority: 0.3 },
  ];
  const posts: MetadataRoute.Sitemap = POSTS.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: "monthly",
    priority: 0.6,
    images: [`${SITE_URL}/blog/${p.slug}/og`],
  }));
  return [...marketing, ...posts];
}
