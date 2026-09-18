/**
 * lib/content-links.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Pulling the links and images out of a body of content.
 *
 * Its own file, with no imports, so the broken-link scan in
 * lib/admin/url-health.ts (which is "server-only", it queries Prisma) is
 * not the only way to reach it — these regexes are the part of the scan
 * most likely to be quietly wrong, and tests/content-links.test.ts is how
 * that stays visible.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type ExtractedLink = { target: string; isImage: boolean };

/**
 * Every link and image in a body of content.
 *
 * Handles Markdown (news articles go through renderMarkdown) and raw HTML
 * in the same pass, because the rich-text fields in this database hold
 * both — Markdown as authored, and HTML pasted in from Word or from the
 * previous site.
 */
export function extractLinks(content: string | null | undefined): ExtractedLink[] {
  if (!content) return [];

  const found: ExtractedLink[] = [];

  // ![alt](url) and [text](url) — the leading "!" is what separates them.
  for (const match of content.matchAll(/(!)?\[[^\]]*\]\(\s*([^)\s]+)/g)) {
    found.push({ target: match[2], isImage: match[1] === "!" });
  }

  for (const match of content.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    found.push({ target: match[1], isImage: false });
  }

  for (const match of content.matchAll(/\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    found.push({ target: match[1], isImage: true });
  }

  return found;
}

/** Links this screen has no opinion about: anchors, mail, phone, and the
 *  placeholder "#" that half the world's CMS content is full of. */
export function isCheckableLink(target: string): boolean {
  const value = target.trim();
  if (value.length === 0) return true;
  return !/^(#|mailto:|tel:|javascript:|data:)/i.test(value);
}
