/**
 * Without an og:image the page is shared as a wall of text — on LINE, which
 * is where most of this site's traffic is shared, that is the difference
 * between a card and a bare link.
 *
 * Read from the row rather than the rendered page: the fallback chain
 * (ogImageUrl, then the cover image, then the site default) lives in the
 * page's own metadata, and what matters here is whether this entity brought
 * an image of its own.
 */
import { fail, pass, type SeoRule } from "@/lib/seo/types";

export const ogImageRule: SeoRule = {
  key: "og-image",
  severity: "warning",
  weight: 5,
  check(input) {
    return (input.ogImageUrl ?? "").trim().length > 0 ? pass : fail();
  },
};
