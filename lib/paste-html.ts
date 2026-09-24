/**
 * lib/paste-html.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Cleaning up HTML pasted in from Word, Google Docs or another web page,
 * before TipTap tries to parse it.
 *
 * The problem is not that the markup is ugly. It is that Word and Google
 * Docs wrap every run of text in nested `<span>`s carrying inline styles
 * and generated class names, and a paste of that shape reaches TipTap's
 * schema as a pile of nodes it has no rule for — so it drops them, and a
 * whole pasted paragraph can simply not appear. Stripping the decoration
 * leaves the structure TipTap does understand: paragraphs, headings,
 * lists, links, bold, italic.
 *
 * What this deliberately does *not* do is guess. A paragraph that happens
 * to be entirely bold is not promoted to a heading: Word documents are
 * full of bold lines that are not headings, and a wrong guess is more
 * annoying to undo than a missing heading is to add. Structure is only
 * ever removed here, never invented.
 *
 * Not "server-only" and free of DOM APIs on purpose — it runs inside
 * `editorProps.transformPastedHTML` in the browser, and is a pure string
 * function so tests/paste-html.test.ts can put real clipboard payloads
 * through it without a DOM.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Tags whose content we keep but whose wrapper is pure noise. */
const UNWRAP_TAGS = ["span", "font", "o:p", "w:sdt", "div"];

/** Attributes that survive. Everything else goes: `style` and `class` are
 *  the whole problem, and TipTap re-derives what it needs from the tags. */
const KEEP_ATTRS = new Set(["href", "src", "alt", "title", "colspan", "rowspan"]);

/**
 * True for the `<img src="data:...">` Word pastes a screenshot as.
 *
 * lib/markdown.ts's sanitizer already refuses these — SAFE_URI allows only
 * http(s), mailto, tel, # and / — so they were being dropped on save with
 * nothing said. The editor asks about them instead, which is why this is
 * exported rather than just stripped here.
 */
export function hasInlineImageData(html: string): boolean {
  return /<img[^>]+src\s*=\s*["']?data:/i.test(html);
}

/**
 * Strip the decoration, keep the structure.
 *
 * Deliberately regex-based rather than DOM-based: `transformPastedHTML`
 * runs on a string before any parsing, and routing it through
 * DOMParser to serialize it straight back adds a second HTML parse whose
 * own error recovery is the thing most likely to mangle Word's malformed
 * markup further.
 */
export function cleanPastedHtml(html: string): string {
  let out = html;

  // Conditional comments and XML islands — Word emits both, and they can
  // contain markup that looks real to a lenient parser.
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<\?xml[^>]*>/gi, "");
  out = out.replace(/<\/?(?:o:p|w:[a-z]+|m:[a-z]+)[^>]*>/gi, "");

  // <style> and <meta> blocks: Google Docs ships a whole stylesheet, Word a
  // <meta> charset, and neither means anything once the styles are gone.
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<meta[^>]*>/gi, "");
  out = out.replace(/<link[^>]*>/gi, "");

  // Unwrap the decorative containers, innermost first — Google Docs nests
  // spans several deep, so one pass leaves the outer ones behind.
  for (const tag of UNWRAP_TAGS) {
    const open = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "gi");
    const close = new RegExp(`</${tag}\\s*>`, "gi");
    let previous: string;
    do {
      previous = out;
      out = out.replace(open, "").replace(close, "");
    } while (out !== previous);
  }

  // Drop every attribute except the few that carry meaning.
  out = out.replace(/<([a-z][a-z0-9]*)((?:\s[^>]*)?)>/gi, (_match, tag: string, attrs: string) => {
    if (!attrs.trim()) return `<${tag}>`;

    const kept: string[] = [];
    const attrPattern = /([a-z-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
    let found: RegExpExecArray | null;
    while ((found = attrPattern.exec(attrs)) !== null) {
      if (KEEP_ATTRS.has(found[1].toLowerCase())) kept.push(`${found[1]}=${found[2]}`);
    }

    return kept.length > 0 ? `<${tag} ${kept.join(" ")}>` : `<${tag}>`;
  });

  // Word marks a bold run with <b> and Google Docs with <strong>; TipTap
  // understands both, so they are left alone. What does need normalising
  // is the empty paragraph Word puts between every real one.
  out = out.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "");

  return out.trim();
}
