import { ImageResponse } from "next/og";
import { OgMark } from "@/components/site/OgMark";
import { SITE_NAME, TAGLINE } from "@/lib/seo";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${SITE_NAME} — ${TAGLINE}`;

// Satori requires every multi-child element to declare an explicit display.
// Headline lines are stacked divs because satori has no <br/> support.
/** Branded 1200×630 social card, rendered at request time by next/og. */
export default function OpengraphImage() {
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
            "radial-gradient(circle at 85% 10%, rgba(223,174,76,0.28) 0%, rgba(223,174,76,0) 50%), radial-gradient(circle at 5% 95%, rgba(111,195,148,0.18) 0%, rgba(111,195,148,0) 45%)",
          fontFamily: "sans-serif",
          color: "#f3ede3",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <OgMark size={64} />
          <div style={{ display: "flex", fontSize: 36, fontWeight: 800, color: "#f3ede3", letterSpacing: -1.5 }}>
            truffle
            <span style={{ color: "#e6b95f", fontWeight: 600 }}>trade</span>
            <span style={{ color: "#6fc394" }}>.</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 88, fontWeight: 800, letterSpacing: -4.5, lineHeight: 1.02 }}>
            <div style={{ display: "flex", color: "#f3ede3" }}>Less noise.</div>
            <div style={{ display: "flex", color: "#e6b95f" }}>More signal.</div>
          </div>
          <div style={{ display: "flex", fontSize: 31, color: "#b3a797", lineHeight: 1.35, maxWidth: 920 }}>
            Nine rival AI analysts, a fact-checker and a red team on any stock chart — with a memory that learns.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 26px",
                borderRadius: 999,
                backgroundColor: "#dfae4c",
                color: "#1b1307",
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              1,000 sats / month · no KYC
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 22px",
                borderRadius: 999,
                border: "2px solid rgba(243,237,227,0.18)",
                color: "#b3a797",
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              Free Windows app · MIT source
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#7d7266", fontWeight: 600 }}>truffletrade.vercel.app</div>
        </div>
      </div>
    ),
    size,
  );
}
