/**
 * lib/markdown.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Article body rendering: Markdown → HTML → sanitized HTML.
 *
 * The sanitize step is not optional. Article bodies are operator-authored,
 * but "trusted author" is a weak assumption for anything that ends up in
 * dangerouslySetInnerHTML — a compromised editor account would otherwise be
 * a stored-XSS vector on every visitor. Sanitizing on the server also means
 * the client never receives the dangerous markup at all.
 *
 * The allowlist is deliberately narrow: prose, links, images, tables. No
 * <script>, no <iframe>, no inline styles, no event handlers.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h2", "h3", "h4",
  "strong", "em", "del", "sub", "sup",
  "ul", "ol", "li",
  "blockquote",
  "a", "img", "figure", "figcaption",
  "code", "pre",
  "table", "thead", "tbody", "tr", "th", "td",
];

const ALLOWED_ATTR = ["href", "title", "target", "rel", "src", "alt", "loading", "colspan", "rowspan"];

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

/**
 * Render a Markdown document to sanitized HTML.
 *
 * Returns "" for empty input so callers can branch on falsiness without a
 * separate null check.
 */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source || source.trim().length === 0) return "";

  installHooks();

  // marked.parse is synchronous unless an async extension is registered.
  const raw = marked.parse(source, { async: false }) as string;

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
 * Strip Markdown to plain text — used for meta descriptions and JSON-LD,
 * where markup would be noise.
 */
export function markdownToText(source: string | null | undefined): string {
  if (!source) return "";

  return source
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")      // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")   // links → their text
    .replace(/^#{1,6}\s+/gm, "")               // headings
    .replace(/[*_`~>]/g, "")                   // emphasis, code, quotes
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
 * Reading time in minutes. Thai does not use spaces between words, so a
 * word count would read as 1 minute for a long article — character count
 * is the portable measure. ~1000 chars/min is a reasonable blended rate.
 */
export function readingMinutes(source: string | null | undefined): number {
  const text = markdownToText(source);
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 1000));
}
