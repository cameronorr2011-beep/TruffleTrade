import { ImageResponse } from "next/og";
import { getPost } from "@/data/blog/posts";
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
          backgroundColor: "#f4f7f1",
          backgroundImage: "radial-gradient(circle at 85% 15%, #dcead9 0%, rgba(220,234,217,0) 55%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 15,
              backgroundColor: "#21583e",
              color: "#ffffff",
              fontSize: 32,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            T
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#26352d", letterSpacing: -1 }}>
            truffle
            <span style={{ color: "#21583e" }}>trade</span>
            <span style={{ color: "#7a8757" }}>.</span>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 22, fontWeight: 700, color: "#6b7a67" }}>FIELD NOTES</div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: title.length > 60 ? 64 : 76,
            fontWeight: 800,
            color: "#26352d",
            letterSpacing: -3,
            lineHeight: 1.08,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 24, color: "#51604f", fontWeight: 600 }}>
          {post ? (
            <>
              <div style={{ display: "flex" }}>
                {new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </div>
              <div style={{ display: "flex" }}>·</div>
              <div style={{ display: "flex" }}>{post.minutes} min read</div>
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
