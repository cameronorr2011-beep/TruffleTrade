import type { NextConfig } from "next";
import path from "node:path";

// `standalone` output is only for self-hosted/desktop bundles (opt in via
// TT_STANDALONE=1, e.g. Electron packaging). On Vercel it breaks the build's
// file-tracing step (next-server.js.nft.json ENOENT) — default output is used.
const nextConfig: NextConfig = {
  output: process.env.TT_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["better-sqlite3"],
  // Security headers (audit §11). CSP is built around what the app actually
  // loads: Next.js inline bootstrap scripts need 'unsafe-inline' on
  // script-src (Next hydration), but everything else is locked down.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js requires inline bootstrap/hydration scripts.
              "script-src 'self' 'unsafe-inline'",
              // Google Fonts: layout.tsx loads Manrope/JetBrains Mono from
              // fonts.googleapis.com (CSS) + fonts.gstatic.com (woff2 files).
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
      // Never cache licensed API responses (they carry subscription state).
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
