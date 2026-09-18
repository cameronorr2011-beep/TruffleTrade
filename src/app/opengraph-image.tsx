import { ImageResponse } from "next/og";
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
          backgroundColor: "#f4f7f1",
          backgroundImage: "radial-gradient(circle at 85% 15%, #dcead9 0%, rgba(220,234,217,0) 55%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              backgroundColor: "#21583e",
              color: "#ffffff",
              fontSize: 34,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            T
          </div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#26352d", letterSpacing: -1 }}>
            truffle
            <span style={{ color: "#21583e" }}>trade</span>
            <span style={{ color: "#7a8757" }}>.</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 84, fontWeight: 800, color: "#26352d", letterSpacing: -4, lineHeight: 1.05 }}>
            <div style={{ display: "flex" }}>Less noise.</div>
            <div style={{ display: "flex", color: "#21583e" }}>More signal.</div>
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#51604f", lineHeight: 1.35, maxWidth: 900 }}>
            Nine rival AI analysts, a fact-checker and a red team on any stock chart — with a memory that learns.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 26px",
              borderRadius: 999,
              backgroundColor: "#21583e",
              color: "#ffffff",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            1,000 sats / month · no KYC
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#6b7a67", fontWeight: 600 }}>truffletrade.vercel.app</div>
        </div>
      </div>
    ),
    size,
  );
}
