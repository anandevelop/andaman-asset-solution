/**
 * lib/slugify.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Turns free-typed text into the `[a-z0-9]+(-[a-z0-9]+)*` shape every slug
 * column requires (see the matching regex on projectSchema/newsArticleSchema/
 * eventSchema/eBrochureSchema in lib/validations.ts) — lowercase, single
 * hyphens, nothing else.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Lowercases and collapses any run of non `[a-z0-9]` characters into a
 * single hyphen, without trimming a leading/trailing hyphen. Used while a
 * slug field is still being typed into (components/admin/SlugField.tsx) —
 * a trailing hyphen is what a trailing space becomes mid-word, and
 * stripping it before the next letter arrives would collapse "the " into
 * "the" right before the next keystroke turned it into "thev" instead of
 * "the-v".
 */
export function slugifyLive(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/**
 * The fully-cleaned form: slugifyLive plus trimming any stray leading or
 * trailing hyphen. Safe to call on a value nobody is still typing into —
 * a field's blur handler, or converting a whole title in one shot.
 */
export function slugify(input: string): string {
  return slugifyLive(input).replace(/^-+|-+$/g, "");
}
