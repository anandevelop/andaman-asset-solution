/**
 * app/robots.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Crawl rules.
 *
 * Anything that is not the canonical site returns a blanket disallow. A
 * staging site that gets indexed competes with the real one for the same
 * queries, and the cleanup — removal requests, waiting for recrawls —
 * costs far more than this check.
 *
 * That used to be decided by NODE_ENV/VERCEL_ENV, which described the
 * staging container exactly as well as the real one and so let staging
 * serve `Allow: /`. It is now an explicit declaration that defaults to
 * "no" — see lib/indexing.ts.
 *
 * robots.txt only asks a crawler not to *fetch*. A URL linked from
 * somewhere else can still be listed without ever being fetched, so the
 * same switch also drives `X-Robots-Tag: noindex` on every response
 * (next.config.js) and the robots metadata in app/[locale]/layout.tsx.
 *
 * Disallowing /admin and /login is tidiness, not security: robots.txt is a
 * request, not an access control. proxy.ts is what actually protects
 * those routes.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { isSiteIndexable } from "@/lib/indexing";

export default function robots(): MetadataRoute.Robots {
  if (!isSiteIndexable()) {
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
