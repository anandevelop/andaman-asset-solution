/**
 * A page that renders noindex without anyone having asked for it.
 *
 * The editor's own per-locale noIndex switch is a content decision and is
 * never a defect — this rule is about the gap between what the row says and
 * what the page served, which is how a page disappears from Google with
 * nobody having touched it.
 *
 * Skipped entirely on a deployment that is not indexable, where *every*
 * page renders noindex on purpose (lib/indexing.ts). Without that check
 * this rule would fail all 372 URLs on staging and mean nothing at all.
 */
import { fail, pass, skip, type SeoRule } from "@/lib/seo/types";

export const unintendedNoindexRule: SeoRule = {
  key: "unintended-noindex",
  severity: "critical",
  weight: 10,
  check(input) {
    if (!input.rendered) return skip("page could not be fetched");
    if (!input.siteIndexable) return skip("deployment is not indexable");

    const rendersNoindex = (input.rendered.metaRobots ?? "").includes("noindex");
    if (!rendersNoindex) return pass;

    // Asked for, so not a defect.
    return input.noIndex ? pass : fail();
  },
};
