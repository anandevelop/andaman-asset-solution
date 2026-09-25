/**
 * lib/seo/types.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The shape every on-page rule is written against.
 *
 * A rule is `{ key, severity, weight, check(input) }` and nothing else. It
 * gets no database, no network and no environment — everything it needs is
 * in the input, which is what makes all fifteen testable from a fixture and
 * what keeps the expensive parts (fetching a page, walking the link graph)
 * in one place instead of fifteen.
 *
 * THREE OUTCOMES, NOT TWO
 *
 * "skip" is not a pass. A rule that needs the rendered HTML cannot say
 * anything about a URL that could not be fetched, and scoring that as a
 * pass would quietly inflate the score of every page the crawler missed —
 * the worst-affected pages scoring best. lib/seo/score.ts drops skipped
 * rules out of the denominator instead, so the score says "out of what
 * could be checked".
 *
 * WHY SOME FIELDS LOOK PRE-CHEWED
 *
 * `duplicates` counts, and the broken-link count, are facts about the whole
 * corpus rather than one URL. They are computed once by the caller and
 * handed in, so that fifteen rules do not each hold an opinion about how to
 * count the site. `siteIndexable` is here for the same reason it exists at
 * all — see the unintended-noindex rule, which is meaningless without it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Locale } from "@/i18n";

/** Matches the vocabulary the admin already uses for SeoIssue. */
export type SeoRuleSeverity = "critical" | "warning" | "minor";

/**
 * What the page actually served, once fetched and parsed.
 *
 * Null on the input when the page could not be fetched at all; every rule
 * that reads it skips rather than failing, because "we could not look" and
 * "we looked and it was wrong" are different answers and only one of them
 * is the page's fault.
 */
export type RenderedPage = {
  /** Absolute URL from <link rel="canonical">, or null when absent. */
  canonical: string | null;
  /** hreflang values seen, lowercased — "x-default" included if present. */
  hreflang: string[];
  h1Count: number;
  /** @type values found in every ld+json block, flattened. */
  jsonLdTypes: string[];
  /** The content of <meta name="robots">, lowercased, or null. */
  metaRobots: string | null;
  /** Images in the rendered body, and how many carry no non-empty alt. */
  imageCount: number;
  imagesMissingAlt: number;
  /** Words of visible body text, for the thin-content rule. */
  wordCount: number;
};

export type SeoRuleInput = {
  /** Locale-prefixed path as a visitor sees it: /th/projects/victory. */
  url: string;
  locale: Locale;
  /** The entity's slug, without any locale prefix. */
  slug: string;

  /** What the <title> will be — metaTitle when set, else the name/title. */
  title: string;
  metaDescription: string;
  /** Per-locale editor switch. A deliberate noindex is never a defect. */
  noIndex: boolean;
  ogImageUrl: string | null;

  /** How many locales this entity has a translation row for. */
  localeCount: number;
  /** How many locales the site has. Passed rather than imported so a test
   *  can describe a two-locale site without faking the i18n module. */
  siteLocaleCount: number;

  /**
   * How many audited URLs carry this exact title / meta description,
   * counting this one. 1 means unique.
   */
  duplicates: { title: number; metaDescription: number };

  /**
   * Whether this deployment may be indexed at all — lib/indexing.ts. On a
   * deployment that may not be, every page renders noindex by design, and
   * the unintended-noindex rule has nothing to say.
   */
  siteIndexable: boolean;

  /** Null when the page could not be fetched. */
  rendered: RenderedPage | null;

  /**
   * Outbound internal links from this URL that do not resolve, counted by
   * lib/admin/url-health.ts's existing scan. Null when that scan has not
   * run. No rule here ever walks content looking for links itself.
   */
  brokenInternalLinks: number | null;
};

export type SeoRuleResult =
  | { status: "pass" }
  /** Not answerable for this URL — missing data, or not applicable. */
  | { status: "skip"; reason: string }
  /** `detail` is shown in the table and the CSV, so it says the number. */
  | { status: "fail"; detail?: string };

export type SeoRule = {
  /** Stored in SeoUrlState.failedRules and SeoRuleWaiver.ruleKey, so it is
   *  a permanent identifier — renaming one is a data migration. */
  key: string;
  severity: SeoRuleSeverity;
  /** Points deducted when it fails. The fifteen sum to exactly 100. */
  weight: number;
  check(input: SeoRuleInput): SeoRuleResult;
};

export const pass: SeoRuleResult = { status: "pass" };
export const skip = (reason: string): SeoRuleResult => ({ status: "skip", reason });
export const fail = (detail?: string): SeoRuleResult => ({ status: "fail", detail });
