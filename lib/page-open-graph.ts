/**
 * lib/page-open-graph.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A public page's openGraph: openGraphFor() (url, site name, locale) plus
 * the share image.
 *
 * Next.js merges metadata per top-level key, so a page that sets openGraph
 * replaces the layout's whole object — images included. Pages that used
 * openGraphFor() alone went out with no og:image (32 listing and static
 * pages, found by the November audit). The image is the admin-editable
 * branding one, the same the layout uses. Server-only because it reads
 * site settings; lib/seo.ts stays importable from client components.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { getSiteSettings } from "@/lib/settings";
import { absoluteAssetUrl, openGraphFor } from "@/lib/seo";

export async function pageOpenGraph(locale: string, path: string, extra: Record<string, unknown> = {}) {
  const { branding } = await getSiteSettings();
  return openGraphFor(locale, path, {
    images: [{ url: absoluteAssetUrl(branding.ogImageUrl), width: 1200, height: 630 }],
    ...extra,
  });
}
