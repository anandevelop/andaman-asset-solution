/**
 * lib/keyword-density.ts
 * ─────────────────────────────────────────────────────────────────────────
 * How often a focus keyword (or any tracked phrase) shows up in an article,
 * weighted by how many words the phrase itself is — so a three-word phrase
 * appearing five times doesn't read as a fifth of the density a one-word
 * phrase appearing five times would.
 *
 * Substring counting, not tokenized matching: an editor typing "ภูเก็ต" or
 * "beachfront villa" wants to know it literally appears that many times,
 * not a stemmed/fuzzy count a search engine might use internally — nobody
 * here can see Google's actual matching, so pretending to model it would
 * be a guess dressed up as a number.
 *
 * Case-insensitive, same reasoning as lib/article-seo.ts's hasKeyword: a
 * keyword typed in one case matching body text in another is the normal
 * case, and a manual pass through this exact panel is what caught the
 * first version's case-sensitive count reading 0 against real content.
 *
 * No imports, matching lib/markdown-text.ts and lib/content-links.ts — the
 * live SEO panel (components/admin/NewsSeoPanel.tsx) calls this on every
 * keystroke and must never risk pulling in something server-only.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type KeywordDensity = { count: number; density: number };

const THAI_CHAR = /[฀-๿]/g;
const LATIN_WORD = /[A-Za-z0-9'’-]+/g;

/** Thai characters at ~4.2/word, plus a plain count of Latin-script words —
 *  duplicated in miniature from lib/content-stats.ts's countWords rather
 *  than imported, so this file can stay at zero imports. */
function countWords(text: string): number {
  const thaiChars = text.match(THAI_CHAR)?.length ?? 0;
  const latinWords = text.match(LATIN_WORD)?.length ?? 0;
  return Math.round(thaiChars / 4.2) + latinWords;
}

/**
 * Returns 0/0 for an empty keyword or empty text rather than dividing by
 * zero — a blank focus-keyword field is the default state of a new
 * article, not an error.
 */
export function getKeywordDensity(text: string, keyword: string): KeywordDensity {
  const trimmedKeyword = keyword.trim();
  const wordCount = countWords(text);

  if (!trimmedKeyword || wordCount === 0) return { count: 0, density: 0 };

  const count = text.toLowerCase().split(trimmedKeyword.toLowerCase()).length - 1;
  const keywordWords = Math.max(1, countWords(trimmedKeyword));

  return { count, density: (count * keywordWords) / wordCount * 100 };
}
