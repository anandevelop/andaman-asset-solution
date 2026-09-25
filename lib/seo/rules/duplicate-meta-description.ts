/**
 * The same description on many pages is a strong hint to Google that the
 * pages are the same page, and it is usually a template that was filled in
 * once and never revisited.
 *
 * Counted across the corpus by the runner, like duplicate-title.
 */
import { fail, pass, skip, type SeoRule } from "@/lib/seo/types";

export const duplicateMetaDescriptionRule: SeoRule = {
  key: "duplicate-meta-description",
  severity: "warning",
  weight: 5,
  check(input) {
    // An empty description is meta-description's problem, not this one —
    // otherwise every page missing one also fails here, and the two
    // numbers double-count the same gap.
    if (input.metaDescription.trim().length === 0) return skip("no description to compare");
    if (input.duplicates.metaDescription <= 1) return pass;

    return fail(`${input.duplicates.metaDescription} pages`);
  },
};
