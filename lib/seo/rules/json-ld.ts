/**
 * Structured data is what turns a result into a rich one — a project with a
 * price range, an article with a date and a byline. A page emitting none is
 * not broken, it is just plain in the results.
 *
 * Only asks whether any @type was emitted. Which type is correct for which
 * page is a decision lib/article-schema.ts already owns, and duplicating
 * that judgement here would give two answers to one question.
 */
import { fail, pass, skip, type SeoRule } from "@/lib/seo/types";

export const jsonLdRule: SeoRule = {
  key: "json-ld",
  severity: "warning",
  weight: 6,
  check(input) {
    if (!input.rendered) return skip("page could not be fetched");
    return input.rendered.jsonLdTypes.length > 0 ? pass : fail();
  },
};
