/**
 * lib/article-render.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The one place a stored article body becomes the HTML a reader sees.
 *
 * Three steps, and the order is load-bearing:
 *
 *   1. sanitize — renderMarkdown for a MARKDOWN article, sanitizeArticleHtml
 *      for one written in the rich-text editor. Both end in the same
 *      DOMPurify call; see lib/markdown.ts.
 *   2. strip the first H1 — the page prints the article's title as its own
 *      H1, so the first one in the body would be a second. See
 *      lib/heading-policy.ts.
 *   3. add heading anchors, for deep links and the editor's outline.
 *
 * Anchors are added *after* sanitizing, which is safe only because the ids
 * are generated in step 3 rather than taken from the document. Reversing
 * the two would leave the sanitizer deciding whether to keep an id it had
 * no part in making.
 *
 * It lives here rather than inline in the news page because a composition
 * written out at its only call site cannot be tested — a test would have to
 * restate the three steps, and then it is asserting its own copy rather
 * than what the page runs. tests/article-render-pipeline.test.ts covers
 * two of §7's acceptance criteria through this function.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { renderMarkdown, sanitizeArticleHtml } from "@/lib/markdown";
import { stripLeadingH1 } from "@/lib/heading-policy";
import { addHeadingAnchors } from "@/lib/heading-anchors";
import type { ContentFormat } from "@/lib/content-stats";

export function renderArticleBody(
  content: string | null | undefined,
  format: ContentFormat,
): string {
  const sanitized = format === "HTML" ? sanitizeArticleHtml(content) : renderMarkdown(content);
  return addHeadingAnchors(stripLeadingH1(sanitized));
}
