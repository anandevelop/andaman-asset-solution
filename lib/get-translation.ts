/**
 * lib/get-translation.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Locale selection for the Translation-table pattern (ProjectTranslation,
 * NewsArticleTranslation, ... — see the model comments in schema.prisma
 * and prisma/migrations/20260820010000_add_i18n_translation_tables).
 *
 * Replaces lib/locale.ts's pickLocale() for every model that has been
 * migrated off column-per-language. pickLocale() only ever chose between
 * two fixed columns (th/en); this picks a row out of an array that can
 * hold up to four (en/th/zh/ru — see i18n.ts), where any locale beyond
 * "en"/"th" may simply not exist yet if an admin hasn't filled it in
 * through the language dropdown.
 *
 * A leaf module on purpose, same reasoning as lib/locale.ts: nothing here
 * imports Prisma or React, so it stays trivially unit-testable and every
 * consumer (public pages, admin completeness badges) can import it without
 * dragging in a server-only context.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The minimum shape this needs — any Translation row qualifies. */
type LocaleRow = { locale: string };

/**
 * Pick the row matching `locale` out of a Translation table's rows for one
 * parent record, falling back to `fallbackLocale` (default "en") and then
 * "th" if the requested locale hasn't been translated yet.
 *
 * Two fallback steps, not one: "en" is the language every Sale Kit source
 * document was originally written in, so it is the most complete locale
 * for older content; "th" is the site's `defaultLocale` (see i18n.ts) and
 * therefore the second-most-likely to exist. A `zh` or `ru` visitor on a
 * project an admin hasn't translated yet still gets real content instead
 * of a blank section.
 *
 * Returns undefined only if `translations` has no row for `locale`,
 * `fallbackLocale`, or "th" — i.e. the parent record has no translations
 * at all (a record created before this migration's backfill ran, or a
 * brand-new one with zero rows). Callers that still read the deprecated
 * nameEn/nameTh-style columns as a last resort (see the `@deprecated`
 * comments in schema.prisma) should fall back to those in that case; this
 * function does not reach into them, since it has no model-specific
 * knowledge of which column pair a given Translation table replaced.
 */
export function getTranslation<T extends LocaleRow>(
  translations: T[],
  locale: string,
  fallbackLocale: string = "en",
): T | undefined {
  // De-duplicated in declaration order: a caller passing fallbackLocale
  // "th" (or requesting "th" itself) shouldn't check the same locale twice.
  const chain = [...new Set([locale, fallbackLocale, "th"])];

  for (const candidate of chain) {
    const match = translations.find((t) => t.locale === candidate);
    if (match) return match;
  }

  return undefined;
}
