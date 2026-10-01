/**
 * lib/media-alt.ts
 * ─────────────────────────────────────────────────────────────────────────
 * When a file's ALT text counts as missing — one rule for the library's
 * server-side count (lib/media.ts) and its client-side badges and filter
 * (components/admin/MediaLibrary.tsx), which until v4 each had their own
 * copy of the same expression.
 *
 * Empty was the only test, so an ALT of "img", "1" or "." passed. Those say
 * nothing to a screen reader or a search engine and are, for every purpose
 * ALT text exists for, missing. Under five characters in any of the four
 * languages is flagged; five is short enough that a real one-word ALT
 * ("Villa", "สระน้ำ") still passes.
 *
 * Pure and import-free so the client bundle can use it.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const MIN_ALT_LENGTH = 5;

export function isAltTextComplete(
  altText: Partial<Record<string, string>> | null | undefined,
  locales: readonly string[],
): boolean {
  if (!altText) return false;
  return locales.every((locale) => (altText[locale] ?? "").trim().length >= MIN_ALT_LENGTH);
}
