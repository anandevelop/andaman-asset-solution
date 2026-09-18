/**
 * app/robots.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Crawl rules.
 *
 * Non-production deployments return a blanket disallow. A staging site that
 * gets indexed competes with the real one for the same queries, and the
 * cleanup — removal requests, waiting for recrawls — costs far more than
 * this check.
 *
 * Disallowing /admin and /login is tidiness, not security: robots.txt is a
 * request, not an access control. proxy.ts is what actually protects
 * those routes.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  const isProduction =
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === undefined);

  if (!isProduction) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/login",
          "/api/",
          // Filtered listings duplicate /news; let the canonical page rank.
          "/*?category=",
        ],
      },
      {
        // Explicitly welcome the crawlers that matter for a Phuket property
        // audience — Bing powers a meaningful slice of expat search.
        userAgent: ["Googlebot", "Bingbot"],
        allow: "/",
        disallow: ["/admin", "/login", "/api/"],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
