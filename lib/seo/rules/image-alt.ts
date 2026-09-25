/**
 * Images with no alt text. Image search is a real referrer for a property
 * site, and alt text is also the only thing a screen reader has to work
 * with — the accessibility reason is the better one.
 */
import { fail, pass, skip, type SeoRule } from "@/lib/seo/types";

export const imageAltRule: SeoRule = {
  key: "image-alt",
  severity: "minor",
  weight: 4,
  check(input) {
    if (!input.rendered) return skip("page could not be fetched");
    if (input.rendered.imageCount === 0) return skip("no images on the page");
    if (input.rendered.imagesMissingAlt === 0) return pass;

    return fail(`${input.rendered.imagesMissingAlt}/${input.rendered.imageCount}`);
  },
};
