/**
 * lib/heading-anchors.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Giving every heading in a rendered article body a stable `id`, so the
 * public page can deep-link into a section and build a table of contents.
 *
 * `lib/slugify.ts`'s `slugify()` is the wrong tool here — it is tuned for
 * URL slugs and keeps only `[a-z0-9]`, which reduces a Thai, Chinese or
 * Russian heading to an empty string. An anchor id has no SEO weight and
 * no uniqueness requirement across the whole site (only within one
 * article), so it can afford to keep any Unicode letter/number instead of
 * transliterating or discarding non-Latin scripts.
 *
 * No imports, matching lib/content-stats.ts and friends — this runs on
 * already-sanitized HTML at render time, but there's no reason to deny it
 * to a future client-side preview too.
 * ─────────────────────────────────────────────────────────────────────────
 */

const HEADING_TAG = /<(h[1-6])((?:\s[^>]*)?)>([\s\S]*?)<\/\1>/gi;
const INNER_TAGS = /<[^>]+>/g;
const EXISTING_ID = /\sid="[^"]*"/i;

/**
 * Unicode-aware: keeps any letter/number script, hyphenates everything
 * else. `\p{L}`/`\p{N}`/`\p{M}` require the `u` flag.
 *
 * `\p{M}` (combining marks) has to be in the keep-set alongside letters
 * and numbers, not just them: Thai tone marks and vowel signs (ั ่ ้ ์ …)
 * are category Mn, not L or N, so without it every Thai word with a tone
 * mark or vowel sign got sliced apart at each one — "นักลงทุน" came out
 * as "น-กลงท-น" instead of staying one word.
 */
function slugifyUnicode(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Injects a slugified `id` onto every `<h1>`–`<h6>` in `html`, replacing
 * any `id` already on the tag so this stays idempotent across repeated
 * runs (render-time sanitization already runs the pipeline more than
 * once — see lib/markdown.ts's header for why).
 *
 * A heading with no extractable text (e.g. one holding only an image)
 * falls back to "section" rather than an empty id. Collisions within the
 * same document are suffixed `-2`, `-3`, … in order of appearance.
 */
export function addHeadingAnchors(html: string): string {
  const seen = new Map<string, number>();

  return html.replace(HEADING_TAG, (match, tag: string, attrs: string, inner: string) => {
    const text = inner.replace(INNER_TAGS, " ").replace(/\s+/g, " ").trim();
    const base = slugifyUnicode(text) || "section";

    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;

    const cleanedAttrs = attrs.replace(EXISTING_ID, "");
    return `<${tag}${cleanedAttrs} id="${id}">${inner}</${tag}>`;
  });
}
