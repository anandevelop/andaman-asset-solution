/**
 * A page with no meta description hands Google a snippet of its own
 * choosing, usually the first sentence it finds. The single highest-weight
 * rule here because it is both the most common gap on this site and the
 * cheapest to close — someone can fix thirty of them in an afternoon
 * without a developer.
 */
import { fail, pass, type SeoRule } from "@/lib/seo/types";

export const metaDescriptionRule: SeoRule = {
  key: "meta-description",
  severity: "critical",
  weight: 12,
  check(input) {
    return input.metaDescription.trim().length > 0 ? pass : fail();
  },
};
