/**
 * lib/admin/translated-form.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Shared plumbing for the "language dropdown" pattern on admin edit forms
 * that write into a Translation table (ProjectTranslation, AwardTranslation,
 * ...). Every one of the 8 forms that uses this follows the same shape:
 *
 *   1. A `?lang=` query param on the edit page selects which locale's
 *      Translation row is being edited — read here via parseEditingLocale().
 *   2. The form shows ONE set of translatable fields (not an EN/TH pair
 *      anymore), pre-filled from that locale's row via pickEditingTranslation()
 *      — an *exact* match, deliberately not the public-facing fallback
 *      chain getTranslation() uses. An admin editing "zh" who sees English
 *      text in the zh fields would reasonably believe zh has already been
 *      translated; showing it blank is what actually prompts them to fill
 *      it in.
 *   3. A row of language tabs (components/admin/LanguageTabs.tsx) next to
 *      the dropdown shows which locales are done, via translationCompleteness().
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { locales, type Locale } from "@/i18n";

export type CompletenessMap = Record<Locale, boolean>;

/**
 * For every site locale, whether a Translation row exists for it with the
 * given required field non-empty. `requiredField` is whichever column that
 * Translation table treats as "the one that must be filled in for this
 * locale to count as translated" — `name` on ProjectTranslation, `title` on
 * AwardTranslation, and so on; see each model's schema.prisma comment.
 */
export function translationCompleteness<T extends { locale: string }>(
  translations: T[],
  requiredField: keyof T,
): CompletenessMap {
  const map = {} as CompletenessMap;

  for (const locale of locales) {
    const row = translations.find((t) => t.locale === locale);
    const value = row?.[requiredField];
    map[locale] = typeof value === "string" && value.trim().length > 0;
  }

  return map;
}

export type CompletenessPercent = Record<Locale, number>;

/**
 * Per-locale completion percentage across an arbitrary set of required
 * fields — a generalization of translationCompleteness() above (which only
 * ever checks one field) for a caller that wants a ring rather than a
 * check/warning icon. Not a replacement: lib/admin/news-list.ts's own
 * REQUIRED_FIELDS-based per-row status intentionally checks a narrower,
 * different field set for its own filtering purpose and is untouched by
 * this addition.
 */
export function translationCompletenessPercent<T extends { locale: string }>(
  translations: T[],
  fields: readonly (keyof T)[],
): CompletenessPercent {
  const map = {} as CompletenessPercent;

  for (const locale of locales) {
    const row = translations.find((t) => t.locale === locale);
    const filledCount = fields.filter((field) => {
      const value = row?.[field];
      return typeof value === "string" && value.trim().length > 0;
    }).length;
    map[locale] = fields.length === 0 ? 0 : Math.round((filledCount / fields.length) * 100);
  }

  return map;
}

/**
 * The row for exactly the locale being edited — no fallback chain. Unlike
 * getTranslation() (used for public rendering, where falling back to "en"
 * is the whole point), an edit form must show a locale's real, current
 * content, blank or not: showing borrowed English text in the Thai tab
 * would look like a translation that was never actually written.
 */
export function pickEditingTranslation<T extends { locale: string }>(
  translations: T[],
  locale: string,
): T | undefined {
  return translations.find((t) => t.locale === locale);
}

/** `?lang=` → a valid site Locale, defaulting to "en" — the language every
 *  Sale Kit source document started in, and so the most useful tab to load
 *  first on a record nothing has been translated into yet. */
export function parseEditingLocale(raw: string | string[] | undefined): Locale {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (locales as readonly string[]).includes(value ?? "") ? (value as Locale) : "en";
}
