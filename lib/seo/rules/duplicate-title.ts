/**
 * Two pages with the same title compete with each other for the same query,
 * and Google picks one — usually not the one anybody wanted.
 *
 * The count comes in with the input: whether a title is duplicated is a
 * fact about the whole corpus, not about this URL, and the runner counts it
 * once for every URL rather than fifteen rules each deciding how.
 */
import { fail, pass, skip, type SeoRule } from "@/lib/seo/types";

export const duplicateTitleRule: SeoRule = {
  key: "duplicate-title",
  severity: "warning",
  weight: 7,
  check(input) {
    if (input.title.trim().length === 0) return skip("no title to compare");
    if (input.duplicates.title <= 1) return pass;

    return fail(`${input.duplicates.title} pages`);
  },
};
