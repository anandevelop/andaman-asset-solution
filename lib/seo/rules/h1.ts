/**
 * Exactly one H1. None leaves the page without its own heading; several
 * leave Google to pick, and the one it picks is rarely the title.
 *
 * Read from the rendered page rather than the body field, because the
 * layout contributes an H1 of its own — see lib/heading-policy.ts, which
 * strips the body's first H1 precisely so this count comes out at one.
 */
import { fail, pass, skip, type SeoRule } from "@/lib/seo/types";

export const h1Rule: SeoRule = {
  key: "h1",
  severity: "warning",
  weight: 8,
  check(input) {
    if (!input.rendered) return skip("page could not be fetched");
    if (input.rendered.h1Count === 1) return pass;

    return fail(String(input.rendered.h1Count));
  },
};
