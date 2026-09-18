import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// App + operator surfaces are product surfaces, not search content.
// Everything under (site) is indexable; everything else stays out.
const DISALLOWED = [
  "/dashboard",
  "/markets",
  "/research",
  "/watchlist",
  "/analyst",
  "/company",
  "/compare",
  "/admin",
  "/api/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOWED }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
