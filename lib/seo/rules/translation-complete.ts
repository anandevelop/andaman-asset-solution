/**
 * A locale with no translation row falls back to another language. The page
 * still renders, which is why this is easy to miss and why it is a rule
 * rather than an error: a Russian visitor gets English, the hreflang tag
 * promises Russian, and nothing anywhere says so.
 *
 * Counts rows, not quality. Whether a row is *good* is what the news
 * editor's own completeness ring answers.
 */
import { fail, pass, type SeoRule } from "@/lib/seo/types";

export const translationCompleteRule: SeoRule = {
  key: "translation-complete",
  severity: "minor",
  weight: 4,
  check(input) {
    if (input.localeCount >= input.siteLocaleCount) return pass;

    return fail(`${input.localeCount}/${input.siteLocaleCount}`);
  },
};
