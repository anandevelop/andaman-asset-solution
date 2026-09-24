/**
 * lib/markdown.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Article body rendering: Markdown → HTML → sanitized HTML, and (for
 * `contentFormat: HTML` articles authored in the TipTap editor —
 * components/admin/RichTextEditor.tsx) HTML → sanitized HTML directly via
 * `sanitizeArticleHtml`, which shares every allowlist and hook below with
 * `renderMarkdown` and simply skips the `marked.parse()` step.
 *
 * The sanitize step is not optional, for either path. Article bodies are
 * operator-authored, but "trusted author" is a weak assumption for
 * anything that ends up in dangerouslySetInnerHTML — a compromised editor
 * account would otherwise be a stored-XSS vector on every visitor. Rich
 * text is sanitized on *both* save (createArticle/updateArticle, before
 * Prisma ever sees it) and again at render — the editor is still a
 * client, and a client is never trusted just because it's ours.
 *
 * The allowlist is deliberately narrow: prose, links, images, tables. No
 * <script>, no <iframe>, no inline styles, no event handlers. `h1`/`h5`/
 * `h6` joined `h2`-`h4` so a rich-text body can use the full heading
 * range — see lib/heading-policy.ts for the rule that keeps a body to one
 * H1. `id` exists so lib/heading-anchors.ts can give headings anchor ids;
 * `data-internal`/`data-media-id` mark a link/image the internal-link and
 * media-library modals inserted, for a future orphan-page scan to tell
 * apart from hand-typed markup without re-parsing the URL.
 *
 * markdownToText/truncate/readingMinutes used to live here too, until a
 * client component needed one of them — see lib/markdown-text.ts's header
 * for why they moved out rather than this file losing its "server-only".
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

/**
 * Every tag the rich-text editor can put into an article.
 *
 * Exported, and the allowlist below is built from it rather than repeating
 * it, because the two drifting apart is not a cosmetic problem: an editor
 * that can *produce* a tag the sanitizer then *drops* loses the author's
 * work on save, silently — no error, no warning, the formatting simply is
 * not there when the page reloads. That is exactly how `<u>` and `<s>`
 * came to be lost for anyone who pressed ⌘U or ⌘⇧X, since TipTap's
 * StarterKit enables underline and strike whether or not a button exists
 * for them.
 *
 * tests/markdown.test.ts asserts every entry here survives
 * sanitizeArticleHtml(), so adding an extension to the editor without
 * adding its tag here fails the suite rather than a reader's page.
 *
 * Keep it in step with components/admin/RichTextEditor.tsx's
 * StarterKit.configure(): anything disabled there does not need to be
 * here, and anything enabled there does.
 */
export const RICH_TEXT_TAGS = [
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "em", "s",
  "ul", "ol", "li",
  "blockquote",
  "a", "img", "figure", "figcaption",
  "code", "pre",
] as const;

/**
 * `del`, `sub`, `sup` and the table tags are not in RICH_TEXT_TAGS: the
 * rich-text editor has no extension that emits them. They stay allowed for
 * the MARKDOWN articles written before that editor existed — `marked`
 * renders `~~x~~` as `<del>`, not `<s>`, so dropping it would strip the
 * strikethrough out of every one of those older articles.
 */
const MARKDOWN_ONLY_TAGS = [
  "del", "sub", "sup",
  "table", "thead", "tbody", "tr", "th", "td",
];

const ALLOWED_TAGS = [...new Set([...RICH_TEXT_TAGS, ...MARKDOWN_ONLY_TAGS])];

const ALLOWED_ATTR = [
  "id", "href", "title", "target", "rel", "src", "alt", "loading",
  "colspan", "rowspan", "data-internal", "data-media-id",
  // Not in the original request list — added because the image modal's
  // "alignment" option (components/admin/InsertImageModal.tsx) has
  // nothing else to carry it: no `class`, no `style`, no generic `data-*`
  // is allowed here, and left/center/right/full is exactly the kind of
  // presentational flag a `data-` attribute (not a class) is for.
  "data-align",
  // Same reasoning as data-align above, for the other half of the same
  // decision: how wide the image is, now that it is no longer welded to
  // how it is aligned. "normal" | "wide" | "full" — see prose-article's
  // own rules, which is where the meaning of each lives.
  "data-width",
];

/** The only URL schemes an article body may point at. */
const SAFE_URI = /^(?:https?:|mailto:|tel:|#|\/)/i;

/**
 * ALLOWED_URI_REGEXP alone is not sufficient. DOMPurify keeps a separate
 * allowance for `data:` URIs on media attributes (img/audio/video/source),
 * and that branch bypasses the regexp entirely — so `data:text/html,…` in
 * an <img src> survives a config that appears to forbid it.
 *
 * This hook re-checks href and src after sanitizing and drops anything
 * outside SAFE_URI, which makes the scheme allowlist actually total.
 */
let hooksInstalled = false;

function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    for (const attribute of ["href", "src"] as const) {
      /* v8 ignore next -- afterSanitizeAttributes only ever fires for
         Element nodes in DOMPurify's actual implementation (verified
         directly: text and comment nodes never reach this hook at all),
         so this guard's true branch cannot be exercised from the public
         API. Kept because the hook's declared type is a plain DOM Node,
         and a defensive check costs nothing against a future DOMPurify
         version that widens the contract. */
      if (typeof node.hasAttribute !== "function") continue;
      if (!node.hasAttribute(attribute)) continue;

      // getAttribute cannot return null once hasAttribute has confirmed
      // the attribute exists — same reasoning as above.
      const value = node.getAttribute(attribute) ?? /* v8 ignore next */ "";
      if (!SAFE_URI.test(value.trim())) node.removeAttribute(attribute);
    }
  });
}

marked.setOptions({
  gfm: true,
  breaks: false,
});

/** The one DOMPurify pass both renderMarkdown and sanitizeArticleHtml
 *  run — same allowlist, same hook, same external-link treatment,
 *  regardless of which storage format the HTML came from. */
function sanitizeHtml(raw: string): string {
  installHooks();

  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // First line of defence; the afterSanitizeAttributes hook above closes
    // the data:-on-media gap this option leaves open.
    ALLOWED_URI_REGEXP: SAFE_URI,
  });

  // Any link that survived sanitizing and points off-site gets the usual
  // noopener/noreferrer treatment. Done with a string pass rather than a
  // DOM walk because the output is already known-safe at this point.
  return clean.replace(
    /<a href="(https?:\/\/[^"]*)"/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer"',
  );
}

/**
 * Render a Markdown document to sanitized HTML.
 *
 * Returns "" for empty input so callers can branch on falsiness without a
 * separate null check.
 */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source || source.trim().length === 0) return "";

  // marked.parse is synchronous unless an async extension is registered.
  const raw = marked.parse(source, { async: false }) as string;
  return sanitizeHtml(raw);
}

/**
 * Sanitize HTML that's already HTML — the TipTap editor's own output, for
 * `contentFormat: HTML` articles. No `marked.parse()` step: the input is
 * not Markdown, so running it through a Markdown parser first would mangle
 * anything that happens to look like Markdown syntax inside real prose
 * (a literal "*" bullet character, an "_" in a filename mentioned in
 * text, and so on).
 *
 * Returns "" for empty input, matching renderMarkdown.
 */
export function sanitizeArticleHtml(html: string | null | undefined): string {
  if (!html || html.trim().length === 0) return "";
  return sanitizeHtml(html);
}
