/**
 * lib/heading-policy.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The rule this codebase settled on for H1 in a rich-text article body:
 * the public page already renders `article.title` as its own `<h1>` (see
 * app/[locale]/(site)/news/[slug]/page.tsx), so the first H1 an editor
 * types in the body *is* the title, kept in sync two ways by
 * components/admin/NewsForm.tsx, and a second H1 is a structural error,
 * not a style choice — a page should have exactly one.
 *
 * `countH1s` backs both sides of that rule from the same extraction
 * lib/content-stats.ts already does, so the live "singleH1" checklist row
 * (lib/article-seo.ts, informational) and the server-side save gate
 * (lib/validations.ts's newsArticleSchema, which actually blocks) can
 * never disagree about what counts as an H1.
 *
 * `stripLeadingH1` is the render-time half: it removes the first H1 from
 * already-sanitized body HTML so the public page never shows two —
 * applied to both content formats, since the shared sanitizer allowlist
 * means old Markdown content can produce an H1 too now (see
 * lib/markdown.ts's header on ALLOWED_TAGS).
 *
 * Imports only lib/content-stats.ts, itself import-free — safe from
 * both a Server Component and NewsForm.tsx's "use client" tree.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getContentStats, type ContentFormat } from "@/lib/content-stats";

/** How many H1s `content` contains, in whichever format it's stored as. */
export function countH1s(content: string | null | undefined, format: ContentFormat): number {
  return getContentStats(content, format).headings.filter((heading) => heading.level === 1).length;
}

/** Remove the first `<h1>` from already-sanitized HTML, leaving the rest
 *  untouched — the page's own `<h1>{article.title}</h1>` is what should
 *  show instead. */
export function stripLeadingH1(html: string): string {
  return html.replace(/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/i, "");
}
