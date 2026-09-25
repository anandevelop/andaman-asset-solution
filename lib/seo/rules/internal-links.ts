/**
 * Outbound internal links from this page that do not resolve.
 *
 * The count is handed in. This rule does not scan content, and must not
 * start to: lib/admin/url-health.ts already walks every published body for
 * the "link health" tab, with its own rules about drafts, legacy hosts and
 * what counts as external. A second scan here would be a second set of
 * answers to the same question, and the tab and the audit would disagree in
 * front of the same person.
 */
import { fail, pass, skip, type SeoRule } from "@/lib/seo/types";

export const internalLinksRule: SeoRule = {
  key: "internal-links",
  severity: "warning",
  weight: 5,
  check(input) {
    if (input.brokenInternalLinks === null) return skip("link scan has not run");
    if (input.brokenInternalLinks === 0) return pass;

    return fail(String(input.brokenInternalLinks));
  },
};
