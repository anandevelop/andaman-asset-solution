/**
 * A canonical pointing somewhere other than this page tells Google to index
 * the other one instead. Wrong here is worse than absent: absent means
 * "index me", wrong means "index something else", and a copy-paste in a
 * template can point a whole content type at one URL.
 *
 * Compared on origin + pathname only. A canonical is allowed to drop a
 * query string — that is usually the point of having one — and comparing
 * whole strings would fail every filtered listing for no reason.
 */
import { fail, pass, skip, type SeoRule } from "@/lib/seo/types";

/** Exported for the test: the comparison is the rule. */
export function canonicalMatches(canonical: string, expectedPath: string): boolean {
  try {
    const url = new URL(canonical);
    return normalise(url.pathname) === normalise(expectedPath);
  } catch {
    // Not an absolute URL. Next always emits one, so this is malformed
    // rather than merely relative.
    return false;
  }
}

/** Trailing slashes are not a difference worth reporting. */
function normalise(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export const canonicalRule: SeoRule = {
  key: "canonical",
  severity: "critical",
  weight: 10,
  check(input) {
    if (!input.rendered) return skip("page could not be fetched");
    if (!input.rendered.canonical) return fail("missing");

    return canonicalMatches(input.rendered.canonical, input.url)
      ? pass
      : fail(input.rendered.canonical);
  },
};
