/**
 * lib/content-stats.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Structural facts about an article body — word count, heading outline,
 * link/image tallies, sentence length — with nothing that needs a network
 * call or a paid API. Reads either storage format a NewsArticle can be in
 * (see the schema.prisma comment on ArticleFormat): Markdown source for
 * old articles, sanitized HTML for TipTap-authored ones. The `format`
 * parameter defaults to "MARKDOWN" so every existing call site and test
 * from before the rich-text editor keeps working unchanged.
 *
 * No imports beyond lib/markdown-text.ts and lib/content-links.ts, both
 * themselves import-free, which is what lets components/admin/
 * NewsSeoPanel.tsx (a "use client" component) call this on every keystroke
 * without pulling lib/markdown.ts's `server-only` sanitizer along for the
 * ride — see lib/markdown-text.ts's header for the request-time failure
 * that guards against.
 *
 * Word count is character-based for Thai and word-based for Latin script,
 * because Thai has no inter-word spaces — the same 4.2-characters-per-word
 * approximation the newsroom style guide the mockup was built from already
 * uses for its own word counts. This is a different formula from
 * readingMinutes()'s character-only count; the two answer different
 * questions (editorial length vs. reading time) and are not meant to agree.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { markdownToText, readingMinutesFromText } from "@/lib/markdown-text";
import { extractLinks, isCheckableLink } from "@/lib/content-links";

export type ContentFormat = "MARKDOWN" | "HTML";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type HeadingOutlineItem = {
  level: HeadingLevel;
  text: string;
  /** More than one level deeper than the nearest heading before it (H2
   *  straight to H4, no H3 between) — flags this specific line, which is
   *  what lets the editor's outline highlight the offending heading
   *  instead of showing one page-wide warning. The first heading in a
   *  document never skips; there is nothing before it to skip from. */
  skipsLevel: boolean;
  /** Inside another block rather than at the top of the document — today
   *  that means an FAQ question, which serializes as
   *  `<h3 data-faq="question">` and so is picked up by the same extractor
   *  as any other heading.
   *
   *  It is listed in the outline on purpose: it is a heading a reader will
   *  see, and it counts for the level-skip warning. But it is not a section
   *  of the article, so §6.3's drag cannot move "it and everything under
   *  it" — there is nothing under it but its own answer, and the thing it
   *  lives in is the FAQ list. The outline uses this to leave those rows
   *  undraggable rather than offering a move that would have to be refused. */
  nested: boolean;
};

export type ContentStats = {
  wordCount: number;
  readingMinutes: number;
  paragraphCount: number;
  headings: HeadingOutlineItem[];
  imageCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  /** Words per sentence, rounded. 0 when there's no measurable sentence. */
  averageSentenceLength: number;
};

const THAI_CHAR = /[฀-๿]/g;
const LATIN_WORD = /[A-Za-z0-9'’-]+/g;
const HTML_TAG = /<[^>]+>/g;

/** Thai characters at ~4.2/word, plus a plain count of Latin-script words. */
function countWords(text: string): number {
  const thaiChars = text.match(THAI_CHAR)?.length ?? 0;
  const latinWords = text.match(LATIN_WORD)?.length ?? 0;
  return Math.round(thaiChars / 4.2) + latinWords;
}

function stripTags(html: string): string {
  return html.replace(HTML_TAG, " ").replace(/\s+/g, " ").trim();
}

/** Plain text out of either format — exported so callers that need
 *  format-aware text (lib/keyword-density.ts's caller, in particular)
 *  don't reach for lib/markdown-text.ts's markdownToText() against HTML
 *  source, which only knows how to strip Markdown syntax, not tags. */
export function getPlainText(content: string | null | undefined, format: ContentFormat = "MARKDOWN"): string {
  const source = content ?? "";
  return format === "HTML" ? stripTags(source) : markdownToText(source);
}

/**
 * Blocks separated by a blank line for Markdown, or `<p>` contents for
 * HTML — the paragraph list either format's rendering ultimately produces.
 * Exported because lib/article-seo.ts needs the first one (for the "focus
 * keyword appears in the opening paragraph" check) and re-deriving it
 * there would be the same extraction living in two files, drifting the
 * moment one changes.
 */
export function splitParagraphs(content: string, format: ContentFormat = "MARKDOWN"): string[] {
  if (format === "HTML") {
    return [...content.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)]
      .map((match) => stripTags(match[1]))
      .filter((text) => text.length > 0);
  }

  return content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && !/^#{1,6}\s/.test(block));
}

function extractHeadings(
  content: string,
  format: ContentFormat,
): { level: HeadingLevel; text: string; nested: boolean }[] {
  const found: { level: HeadingLevel; text: string; nested: boolean }[] = [];

  if (format === "HTML") {
    // Group 2 is the opening tag's attributes, which is how an FAQ
    // question is told apart from an ordinary heading of the same level.
    for (const match of content.matchAll(/<h([1-6])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/gi)) {
      const text = stripTags(match[3]);
      if (text) {
        found.push({
          level: Number(match[1]) as HeadingLevel,
          text,
          nested: /data-faq\s*=\s*["']question["']/i.test(match[2]),
        });
      }
    }
    return found;
  }

  // Markdown has no FAQ block — the editor that produces one only ever
  // writes HTML — so every heading there is a section of its own.
  for (const match of content.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
    found.push({ level: match[1].length as HeadingLevel, text: match[2].trim(), nested: false });
  }
  return found;
}

/** Walks the extracted headings in document order, marking any that skip
 *  a level relative to the one immediately before it. */
function withSkipFlags(
  headings: { level: HeadingLevel; text: string; nested: boolean }[],
): HeadingOutlineItem[] {
  let previousLevel: HeadingLevel | null = null;

  return headings.map((heading) => {
    const skipsLevel = previousLevel !== null && heading.level > previousLevel + 1;
    previousLevel = heading.level;
    return { ...heading, skipsLevel };
  });
}

/** Split on sentence-ending punctuation and the em-dash aside this house
 *  style favors; fragments under 12 characters are too short to be a real
 *  sentence and would drag the average down artificially. */
function countSentences(text: string): number {
  return text
    .split(/[.!?。]|\s—\s/)
    .filter((sentence) => sentence.trim().length > 12).length;
}

export type CheckableLink = { target: string; internal: boolean };

/** The same checkable (non-image) links getContentStats() counts into
 *  internalLinkCount/externalLinkCount, as a list rather than a tally —
 *  for the editor's Links tab, which shows what's actually in the body
 *  rather than just how many. Kept in sync with getContentStats() by
 *  construction: both filter the same extractLinks() output through the
 *  same isCheckableLink()/isImage checks, so the two can't disagree. No
 *  format parameter — extractLinks() is already dual-format internally,
 *  the same way getContentStats() calls it below. */
export function extractCheckableLinks(content: string | null | undefined): CheckableLink[] {
  const links = extractLinks(content ?? "");
  return links
    .filter((link) => !link.isImage && isCheckableLink(link.target))
    .map((link) => ({ target: link.target, internal: link.target.startsWith("/") }));
}

export function getContentStats(
  content: string | null | undefined,
  format: ContentFormat = "MARKDOWN",
): ContentStats {
  const source = content ?? "";
  const plainText = format === "HTML" ? stripTags(source) : source.replace(/\s+/g, " ").trim();

  const wordCount = countWords(plainText);
  const sentenceCount = countSentences(plainText);
  const headings = withSkipFlags(extractHeadings(source, format));

  const links = extractLinks(source);
  const images = links.filter((link) => link.isImage);
  const checkableLinks = links.filter((link) => !link.isImage && isCheckableLink(link.target));

  return {
    wordCount,
    readingMinutes:
      format === "HTML" ? readingMinutesFromText(plainText) : readingMinutesFromText(markdownToText(source)),
    paragraphCount: splitParagraphs(source, format).length,
    headings,
    imageCount: images.length,
    internalLinkCount: checkableLinks.filter((link) => link.target.startsWith("/")).length,
    externalLinkCount: checkableLinks.filter((link) => link.target.startsWith("http")).length,
    averageSentenceLength: sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0,
  };
}
