/**
 * Under 300 words of visible text. Not a defect in itself — a contact page
 * is short because it should be — which is why it is weighted low and why
 * the waiver exists: a page that is meant to be short gets waived once and
 * stops being red forever.
 *
 * Counted from the rendered page, so it counts what a reader sees rather
 * than what the body field contains: an article that is mostly an embedded
 * gallery is thin whatever its HTML weighs.
 */
import { fail, pass, skip, type SeoRule } from "@/lib/seo/types";

export const THIN_CONTENT_MIN_WORDS = 300;

export const thinContentRule: SeoRule = {
  key: "thin-content",
  severity: "minor",
  weight: 4,
  check(input) {
    if (!input.rendered) return skip("page could not be fetched");
    if (input.rendered.wordCount >= THIN_CONTENT_MIN_WORDS) return pass;

    return fail(`${input.rendered.wordCount} words`);
  },
};
