/**
 * Four locales, so four hreflang entries — anything less and Google is
 * left to guess which language version to show a Thai searcher, and often
 * shows the English one.
 *
 * Counted from what the page actually rendered rather than from the
 * translation rows: a row can exist while the tag is missing, and it is the
 * tag Google reads. x-default is not required and is not counted.
 */
import { fail, pass, skip, type SeoRule } from "@/lib/seo/types";

export const hreflangRule: SeoRule = {
  key: "hreflang",
  severity: "critical",
  weight: 10,
  check(input) {
    if (!input.rendered) return skip("page could not be fetched");

    const locales = new Set(
      input.rendered.hreflang.map((value) => value.toLowerCase()).filter((value) => value !== "x-default"),
    );
    if (locales.size >= input.siteLocaleCount) return pass;

    return fail(`${locales.size}/${input.siteLocaleCount}`);
  },
};
