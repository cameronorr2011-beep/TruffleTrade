import { POSTS } from "@/data/blog/posts";
import { DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** RSS 2.0 feed of the blog — linked from <head> via alternates.types. */
export function GET() {
  const posts = POSTS; // already newest-first
  const lastBuild = posts[0] ? new Date(posts[0].date).toUTCString() : new Date().toUTCString();

  const items = posts
    .map((p) => {
      const url = absoluteUrl(`/blog/${p.slug}`);
      const html = p.body
        .map((s) => `${s.heading ? `<h2>${esc(s.heading)}</h2>` : ""}${s.paragraphs.map((t) => `<p>${esc(t)}</p>`).join("")}`)
        .join("");
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description>${esc(p.description)}</description>
      <content:encoded><![CDATA[${html}]]></content:encoded>
${p.tags.map((t) => `      <category>${esc(t)}</category>`).join("\n")}
      <enclosure url="${absoluteUrl(`/blog/${p.slug}/og`)}" type="image/png" length="0" />
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${esc(SITE_NAME)} — field notes</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${esc(DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <image>
      <url>${absoluteUrl("/icon-512.png")}</url>
      <title>${esc(SITE_NAME)}</title>
      <link>${SITE_URL}</link>
    </image>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
