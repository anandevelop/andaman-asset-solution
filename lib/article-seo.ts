/**
 * lib/article-seo.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The per-article checklist behind the news editor's live SEO score —
 * ported from the checklist in the approved content-studio mockup, minus
 * every check that would need a third-party integration this codebase
 * doesn't have (keyword rank, search volume, AI translation, and so on —
 * see lib/seo-audit.ts and lib/admin/page-seo.ts for why this project
 * never mixes a real number with a guessed one on the same screen).
 *
 * Checks carry an id, not display text. The text lives in messages/*.json
 * under admin.news.seo.checks.<id> — this file is imported by a "use
 * client" component (components/admin/NewsSeoPanel.tsx) that recomputes on
 * every keystroke, and next-intl's t() needs to run there, not in a
 * plain .ts module with no locale in scope.
 *
 * `languageComplete` arrives as a plain boolean rather than being computed
 * here, because the real per-locale completeness logic
 * (lib/admin/news-list.ts's localeStatesOf / lib/admin/translated-form.ts's
 * translationCompleteness) either lives in a "server-only" file or needs a
 * DB round-trip. The caller works out the same true/false and hands it in.
 *
 * Status tiers: a failing weight-3 check is always "fail" (it blocks
 * publishing — see app/[locale]/admin/(content)/news/actions.ts's publish
 * gate), and so are `singleH1`/`headingHierarchy` regardless of their own
 * weight, per this checklist's explicit spec. Every other failing check is
 * "warn" — visible, scored against, but never save-blocking on its own.
 *
 * Supersedes lib/seo-score.ts (deleted in the same change that added this
 * file) — see that file's git history for the pre-pass/warn/fail version
 * this was ported from.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getContentStats, splitParagraphs, type ContentFormat } from "@/lib/content-stats";
import { SEO_LIMITS } from "@/lib/seo-limits";
import { hasFaqBlock } from "@/lib/faq-block";

export type SeoCheckId =
  | "keywordInTitle"
  | "keywordInMetaTitle"
  | "keywordInMetaDescription"
  | "keywordInFirstParagraph"
  | "singleH1"
  | "hasEnoughH2"
  | "hasH3"
  | "headingHierarchy"
  | "metaTitleLength"
  | "metaDescriptionLength"
  | "bodyLength"
  | "internalLinks"
  | "externalLinks"
  | "imageAltText"
  | "hasImage"
  | "slugFormat"
  | "excerptLength"
  | "sentenceLength"
  | "languageComplete"
  | "hasShareImages"
  | "hasFaqBlock";

export type SeoCheckStatus = "pass" | "warn" | "fail";

export type SeoCheck = {
  id: SeoCheckId;
  weight: 1 | 2 | 3;
  status: SeoCheckStatus;
  messageKey: string;
};

export type SeoScoreInput = {
  title: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  excerpt: string;
  focusKeyword: string;
  content: string;
  /** Which storage format `content` is in — see lib/content-stats.ts's
   *  header. Required, not defaulted: getting this wrong silently
   *  mis-extracts every heading/paragraph/word-count check below. */
  contentFormat: ContentFormat;
  coverImageUrl: string | null;
  ogImageUrl: string | null;
  /** Whether every locale has a title and a body — see the header comment
   *  for why this is computed by the caller, not here. */
  languageComplete: boolean;
};

export type SeoScoreResult = {
  score: number;
  checks: SeoCheck[];
  /** True iff any check has status "fail" — this is what the publish gate
   *  in actions.ts reads to decide whether to hold isPublished at false. */
  hasBlockingFailure: boolean;
};

/**
 * A blank focus keyword fails every keyword check rather than skipping
 * it — the mockup this is ported from does the same (`kw && …`), and an
 * unset keyword is a real gap in the article, not a not-applicable check.
 *
 * Case-insensitive: an editor typing "Beachfront villas" as a focus
 * keyword and "beachfront villas" in the title (or the reverse — a title
 * capitalizes the first word of a sentence, a keyword field usually
 * doesn't) is the normal case, not an edge case, and every mainstream SEO
 * checklist this one is modeled after matches the same way.
 */
function hasKeyword(haystack: string, keyword: string): boolean {
  return keyword.length > 0 && haystack.toLowerCase().includes(keyword.toLowerCase());
}

// Every image in the body must carry non-empty alt text. Kept local to
// this file rather than added to lib/content-links.ts#extractLinks — that
// function's return shape ({target, isImage}) is locked by exact toEqual
// assertions in tests/content-links.test.ts, and alt text isn't part of
// what a link-health scan needs anyway.
const MD_IMAGE = /!\[([^\]]*)\]\(/g;
const HTML_IMG_TAG = /<img\b[^>]*>/gi;
const HTML_ALT_ATTR = /\balt\s*=\s*"([^"]*)"|\balt\s*=\s*'([^']*)'/i;

function everyImageHasAlt(content: string, format: ContentFormat): boolean {
  if (format === "HTML") {
    const tags = content.match(HTML_IMG_TAG) ?? [];
    if (tags.length === 0) return true;
    return tags.every((tag) => {
      const match = HTML_ALT_ATTR.exec(tag);
      const alt = match ? (match[1] ?? match[2] ?? "") : "";
      return alt.trim().length > 0;
    });
  }

  const matches = [...content.matchAll(MD_IMAGE)];
  if (matches.length === 0) return true;
  return matches.every((match) => (match[1] ?? "").trim().length > 0);
}

const FORCED_FAIL_TIER = new Set<SeoCheckId>(["singleH1", "headingHierarchy"]);

function statusFor(weight: number, id: SeoCheckId, passed: boolean): SeoCheckStatus {
  if (passed) return "pass";
  return weight === 3 || FORCED_FAIL_TIER.has(id) ? "fail" : "warn";
}

function check(id: SeoCheckId, weight: 1 | 2 | 3, passed: boolean): SeoCheck {
  return { id, weight, status: statusFor(weight, id, passed), messageKey: `news.seo.checks.${id}` };
}

export function auditArticle(input: SeoScoreInput): SeoScoreResult {
  const keyword = input.focusKeyword.trim();
  const stats = getContentStats(input.content, input.contentFormat);
  const firstParagraph = splitParagraphs(input.content, input.contentFormat)[0] ?? "";
  const h1Count = stats.headings.filter((heading) => heading.level === 1).length;
  const h2Count = stats.headings.filter((heading) => heading.level === 2).length;
  const h3Count = stats.headings.filter((heading) => heading.level === 3).length;

  const checks: SeoCheck[] = [
    check("keywordInTitle", 3, hasKeyword(input.title, keyword)),
    check("keywordInMetaTitle", 3, hasKeyword(input.metaTitle, keyword)),
    check("keywordInMetaDescription", 2, hasKeyword(input.metaDescription, keyword)),
    check("keywordInFirstParagraph", 2, hasKeyword(firstParagraph, keyword)),
    // Forced fail-tier below regardless of weight — see FORCED_FAIL_TIER.
    // Advisory only: the actual save-blocking H1-count gate lives in
    // lib/validations.ts's newsArticleSchema, via the same countH1s() this
    // reads from the same headings list, so the two can never disagree.
    check("singleH1", 2, h1Count <= 1),
    check("hasEnoughH2", 2, h2Count >= 2),
    check("hasH3", 1, h3Count >= 1),
    check("headingHierarchy", 2, !stats.headings.some((heading) => heading.skipsLevel)),
    check(
      "metaTitleLength",
      3,
      input.metaTitle.length >= SEO_LIMITS.titleMin && input.metaTitle.length <= SEO_LIMITS.title,
    ),
    check(
      "metaDescriptionLength",
      3,
      input.metaDescription.length >= SEO_LIMITS.descriptionMin &&
        input.metaDescription.length <= SEO_LIMITS.description,
    ),
    check("bodyLength", 3, stats.wordCount >= 600),
    check("internalLinks", 3, stats.internalLinkCount >= 2),
    check("externalLinks", 1, stats.externalLinkCount >= 1),
    check("imageAltText", 3, everyImageHasAlt(input.content, input.contentFormat)),
    check("hasImage", 2, stats.imageCount >= 1),
    check("slugFormat", 2, /^[a-z0-9-]+$/.test(input.slug) && input.slug.length <= 60),
    check("excerptLength", 2, input.excerpt.trim().length >= 60),
    check(
      "sentenceLength",
      1,
      stats.averageSentenceLength > 0 && stats.averageSentenceLength <= 28,
    ),
    check("languageComplete", 1, input.languageComplete),
    // Both a cover image AND an OG image, not either/or — a deliberate
    // change from this check's predecessor (shareImageSet), which passed
    // on a cover image alone.
    // Detected from the block's own data-faq marker, never from a heading
    // that happens to say "FAQ" — see lib/faq-block.ts.
    check("hasFaqBlock", 2, hasFaqBlock(input.content, input.contentFormat)),
    check("hasShareImages", 2, Boolean(input.coverImageUrl) && Boolean(input.ogImageUrl)),
  ];

  const totalWeight = checks.reduce((sum, item) => sum + item.weight, 0);
  const earnedWeight = checks.reduce((sum, item) => sum + (item.status === "pass" ? item.weight : 0), 0);

  return {
    score: totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0,
    checks,
    hasBlockingFailure: checks.some((item) => item.status === "fail"),
  };
}
