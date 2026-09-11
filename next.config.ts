import type { NextConfig } from "next";
import path from "node:path";

// `standalone` output is only for self-hosted/desktop bundles (opt in via
// TT_STANDALONE=1, e.g. Electron packaging). On Vercel it breaks the build's
// file-tracing step (next-server.js.nft.json ENOENT) — default output is used.
const nextConfig: NextConfig = {
  output: process.env.TT_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
