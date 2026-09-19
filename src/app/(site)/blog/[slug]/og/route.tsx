import { ImageResponse } from "next/og";
import { getPost } from "@/data/blog/posts";
import { OgMark } from "@/components/site/OgMark";
import { SITE_NAME } from "@/lib/seo";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori requires every multi-child element to declare an explicit display.
// Served as a route handler under /blog/<slug>/og — the file-convention
// variant registers only a hash-suffixed URL in this Next version, which
// doesn't match the canonical /opengraph-image path in meta tags.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  const title = post?.title ?? "The TruffleTrade blog";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#0b0908",
          backgroundImage:
            "radial-gradient(circle at 90% 5%, rgba(223,174,76,0.26) 0%, rgba(223,174,76,0) 50%), radial-gradient(circle at 0% 100%, rgba(111,195,148,0.16) 0%, rgba(111,195,148,0) 45%)",
          fontFamily: "sans-serif",
          color: "#f3ede3",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <OgMark size={56} />
          <div style={{ display: "flex", fontSize: 32, fontWeight: 800, color: "#f3ede3", letterSpacing: -1.2 }}>
            truffle
            <span style={{ color: "#e6b95f", fontWeight: 600 }}>trade</span>
            <span style={{ color: "#6fc394" }}>.</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", fontSize: 20, fontWeight: 700, color: "#c9a468", letterSpacing: 3 }}>
            FIELD NOTES
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: title.length > 60 ? 62 : 76,
            fontWeight: 800,
            color: "#f3ede3",
            letterSpacing: -3,
            lineHeight: 1.08,
            maxWidth: 1020,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, color: "#b3a797", fontWeight: 600 }}>
          {post ? (
            <>
              <div style={{ display: "flex" }}>
                {new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </div>
              <div style={{ display: "flex", color: "#7d7266" }}>·</div>
              <div style={{ display: "flex" }}>{post.minutes} min read</div>
              {post.tags.slice(0, 3).map((t) => (
                <div
                  key={t}
                  style={{
                    display: "flex",
                    padding: "6px 16px",
                    borderRadius: 999,
                    border: "2px solid rgba(230,185,95,0.35)",
                    color: "#e6b95f",
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                >
                  {t}
                </div>
              ))}
            </>
          ) : (
            <div style={{ display: "flex" }}>{SITE_NAME} blog</div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
