/**
 * lib/markdown-text.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The plain-text half of Markdown handling — split out of lib/markdown.ts
 * because that file carries `import "server-only"` (it wraps `marked` +
 * `isomorphic-dompurify`, real sanitization that has no business running in
 * a browser), and these three functions have no such dependency.
 *
 * The split exists for a concrete reason, not tidiness: components/admin/
 * NewsForm.tsx's live word-count readout used to hand-duplicate the
 * `readingMinutes` formula client-side, because importing the real one
 * from lib/markdown.ts would have pulled `server-only` into a client
 * component and failed at request time — the exact trap lib/seo-limits.ts's
 * own header describes. Two copies of the same formula drift; this file is
 * the fix, not a rename.
 *
 * No imports here, and none should be added — that is what makes this file
 * safe from both a Server Component and a "use client" one.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Strip Markdown to plain text — used for meta descriptions and JSON-LD,
 * where markup would be noise.
 */
export function markdownToText(source: string | null | undefined): string {
  if (!source) return "";

  return source
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/[*_`~>]/g, "") // emphasis, code, quotes
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncate on a word boundary, for excerpt fallbacks. */
export function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Reading time in minutes, from plain text that's already had its markup
 * stripped — by markdownToText below for Markdown source, or by an HTML
 * tag-strip for rich-text source (see lib/content-stats.ts's HTML
 * branch). Split out from readingMinutes so both formats share the one
 * formula instead of each format acquiring its own copy.
 *
 * Thai does not use spaces between words, so a word count would read as
 * 1 minute for a long article — character count is the portable measure.
 * ~1000 chars/min is a reasonable blended rate.
 */
export function readingMinutesFromText(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 1000));
}

/** Reading time straight from Markdown source. */
export function readingMinutes(source: string | null | undefined): number {
  return readingMinutesFromText(markdownToText(source));
}
