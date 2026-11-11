/**
 * lib/locale.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Bilingual field selection.
 *
 * A leaf module on purpose. This lived in lib/projects.ts, which meant
 * every consumer — news, events, FAQs — imported Prisma and React's
 * `cache()` transitively just to pick between two strings. That made those
 * modules impossible to unit test outside a React server context, and
 * coupled several files to one for no reason.
 *
 * Nothing here imports anything.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type Locale = "th" | "en";

/**
 * Pick the TH or EN column of a bilingual field pair, falling back to the
 * other language rather than rendering an empty string.
 *
 * The fallback matters: a project with an English description and no Thai
 * one should show the English text to a Thai visitor, not a blank section.
 */
export function pickLocale(
  locale: string,
  th: string | null | undefined,
  en: string | null | undefined,
): string {
  // Blank counts as missing: the admin forms save an emptied field as ""
  // rather than null, and `"" ?? en` is "" — the Thai report showed a
  // nameless row for every project typed in English only.
  const filled = (v: string | null | undefined) => (v?.trim() ? v : undefined);
  const value = locale === "th" ? filled(th) ?? filled(en) : filled(en) ?? filled(th);
  return value ?? "";
}
