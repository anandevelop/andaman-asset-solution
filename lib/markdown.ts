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

const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "em", "del", "sub", "sup",
  "ul", "ol", "li",
  "blockquote",
  "a", "img", "figure", "figcaption",
  "code", "pre",
  "table", "thead", "tbody", "tr", "th", "td",
];

const ALLOWED_ATTR = [
  "id", "href", "title", "target", "rel", "src", "alt", "loading",
  "colspan", "rowspan", "data-internal", "data-media-id",
  // Not in the original request list — added because the image modal's
  // "alignment" option (components/admin/InsertImageModal.tsx) has
  // nothing else to carry it: no `class`, no `style`, no generic `data-*`
  // is allowed here, and left/center/right/full is exactly the kind of
  // presentational flag a `data-` attribute (not a class) is for.
  "data-align",
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
      if (typeof node.hasAttribute !== "function") continue;
      if (!node.hasAttribute(attribute)) continue;

      const value = node.getAttribute(attribute) ?? "";
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
