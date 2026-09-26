/**
 * lib/seo/brand.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Telling "someone looking for us" apart from "someone looking for a villa
 * in Phuket".
 *
 * WHY EVERY CLICK FIGURE IS SPLIT THIS WAY
 *
 * Somebody who searches "trinity village phuket" already knows the
 * company. Those clicks are worth having and say nothing about whether the
 * site can be found by anyone new — which is the only question SEO work is
 * trying to answer. Reported together, a month of brand searches from
 * existing customers reads as growth, and the number goes up every time
 * the sales team runs an advertisement somewhere else entirely.
 *
 * So brand and non-brand are shown apart wherever clicks appear, and the
 * non-brand figure is the one the report leads with.
 *
 * MATCHING IS DELIBERATELY CRUDE
 *
 * Case-insensitive substring, over a list the team edits. Not a regex, not
 * fuzzy: this is a judgement about marketing, made by whoever knows how
 * customers refer to these developments, and the failure it must avoid is
 * a clever rule that nobody can predict or explain.
 *
 * A term matching too much is the expensive direction: one bad entry
 * zeroes the non-brand figure the split exists to protect. Very short
 * terms are ignored, and so is the handful of function words that a length
 * rule cannot catch — see NEVER_A_BRAND below.
 *
 * THE LIST HAS TO COVER EVERY LANGUAGE THE PROJECTS ARE CALLED BY
 *
 * A Thai searcher types "ทรินิตี้ วิลเลจ". Left out, that search counts as
 * non-brand and the non-brand figure is overstated in the market the site
 * actually sells in. The settings screen says so, because the list is only
 * as good as the person filling it in.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Below this, a term matches so much that it is never a useful signal. */
export const MIN_TERM_LENGTH = 3;

/**
 * Words that are never a brand on their own.
 *
 * A length rule cannot catch these: "the" is three characters, so is a
 * perfectly good three-letter brand. And "the" as a brand term files the
 * entire internet under brand — every English query contains it — which
 * takes the one number this split exists to protect and zeroes it.
 *
 * Deliberately tiny, and English-only because that is where the problem
 * is: Thai has no articles, and the risk of over-matching comes from
 * function words a person might type while listing "The Victory, The
 * Residence". A real stopword list per language would be a system nobody
 * asked for, and would eventually drop a term somebody meant.
 */
const NEVER_A_BRAND = new Set(["the", "and", "for", "with", "from", "our"]);

/**
 * Parse the stored setting into terms.
 *
 * Stored as one comma-separated string because that is what the settings
 * table holds and what a person types. Blank entries, stray whitespace and
 * duplicates are all things a real list acquires over a year of edits.
 */
export function parseBrandTerms(stored: string | null | undefined): string[] {
  if (!stored) return [];

  const seen = new Set<string>();

  for (const raw of stored.split(",")) {
    const term = raw.trim().toLowerCase();
    if (term.length >= MIN_TERM_LENGTH && !NEVER_A_BRAND.has(term)) seen.add(term);
  }

  return [...seen];
}

/** Whether a search query mentions the company or one of its developments. */
export function isBrandQuery(query: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return false;

  const haystack = query.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

export type BrandSplit<T> = { brand: T[]; nonBrand: T[] };

/** Split rows by whether their query is a brand search. */
export function splitByBrand<T extends { query: string }>(
  rows: readonly T[],
  terms: readonly string[],
): BrandSplit<T> {
  const brand: T[] = [];
  const nonBrand: T[] = [];

  for (const row of rows) {
    (isBrandQuery(row.query, terms) ? brand : nonBrand).push(row);
  }

  return { brand, nonBrand };
}

export type ClickTotals = { clicks: number; impressions: number };

/** Clicks and impressions either side of the split. */
export function brandTotals<T extends { query: string; clicks: number; impressions: number }>(
  rows: readonly T[],
  terms: readonly string[],
): { brand: ClickTotals; nonBrand: ClickTotals } {
  const sum = (subset: readonly T[]): ClickTotals => ({
    clicks: subset.reduce((total, row) => total + row.clicks, 0),
    impressions: subset.reduce((total, row) => total + row.impressions, 0),
  });

  const { brand, nonBrand } = splitByBrand(rows, terms);
  return { brand: sum(brand), nonBrand: sum(nonBrand) };
}

/**
 * Queries that name a development but are not covered by the brand list.
 *
 * What the settings screen shows to make the list improvable: a project
 * called "The Victory" whose searches are all filed as non-brand is a gap
 * somebody can close in ten seconds, once they can see it.
 *
 * Compared on words rather than substrings, because a project name that
 * happens to contain a common word would otherwise pull in every query
 * containing that word and bury the real suggestions.
 */
export function unmatchedProjectQueries(
  rows: readonly { query: string; clicks: number }[],
  projectNames: readonly string[],
  terms: readonly string[],
): { query: string; clicks: number }[] {
  const names = projectNames
    .map((name) => name.toLowerCase().split(/\s+/).filter((word) => word.length >= MIN_TERM_LENGTH))
    .filter((words) => words.length > 0);

  if (names.length === 0) return [];

  return rows
    .filter((row) => {
      if (isBrandQuery(row.query, terms)) return false;

      const words = new Set(row.query.toLowerCase().split(/\s+/));
      // Every significant word of some project name is present.
      return names.some((nameWords) => nameWords.every((word) => words.has(word)));
    })
    .sort((a, b) => b.clicks - a.clicks);
}
