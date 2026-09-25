/**
 * lib/seo/rules/index.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The fifteen on-page rules, in the order the audit table shows them:
 * heaviest first, which is also most-severe first.
 *
 * Order is part of the contract, not a formatting choice — the table and
 * the CSV both render this array as-is, so "what to fix first" is decided
 * here rather than by a sort in the UI that could disagree with the CSV.
 *
 * The weights sum to exactly 100, and a test asserts it. That is what lets
 * lib/seo/score.ts subtract failures from 100 without a normalising step,
 * and what makes a weight change a deliberate act: raising one means taking
 * points from another.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { SeoRule } from "@/lib/seo/types";

import { metaDescriptionRule } from "@/lib/seo/rules/meta-description";
import { hreflangRule } from "@/lib/seo/rules/hreflang";
import { canonicalRule } from "@/lib/seo/rules/canonical";
import { unintendedNoindexRule } from "@/lib/seo/rules/unintended-noindex";
import { h1Rule } from "@/lib/seo/rules/h1";
import { duplicateTitleRule } from "@/lib/seo/rules/duplicate-title";
import { titleLengthRule } from "@/lib/seo/rules/title-length";
import { jsonLdRule } from "@/lib/seo/rules/json-ld";
import { duplicateMetaDescriptionRule } from "@/lib/seo/rules/duplicate-meta-description";
import { ogImageRule } from "@/lib/seo/rules/og-image";
import { internalLinksRule } from "@/lib/seo/rules/internal-links";
import { thinContentRule } from "@/lib/seo/rules/thin-content";
import { imageAltRule } from "@/lib/seo/rules/image-alt";
import { slugLengthRule } from "@/lib/seo/rules/slug-length";
import { translationCompleteRule } from "@/lib/seo/rules/translation-complete";

export const SEO_RULES: readonly SeoRule[] = [
  metaDescriptionRule, // 12  critical
  hreflangRule, //        10  critical
  canonicalRule, //       10  critical
  unintendedNoindexRule, // 10 critical
  h1Rule, //               8  warning
  duplicateTitleRule, //   7  warning
  titleLengthRule, //      6  warning
  jsonLdRule, //           6  warning
  duplicateMetaDescriptionRule, // 5 warning
  ogImageRule, //          5  warning
  internalLinksRule, //    5  warning
  thinContentRule, //      4  minor
  imageAltRule, //         4  minor
  slugLengthRule, //       4  minor
  translationCompleteRule, // 4 minor
] as const;

/** Every rule key, for validating a stored waiver against the current set. */
export const SEO_RULE_KEYS: readonly string[] = SEO_RULES.map((rule) => rule.key);

export function findRule(key: string): SeoRule | undefined {
  return SEO_RULES.find((rule) => rule.key === key);
}
