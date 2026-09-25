/**
 * lib/analytics/locale-of.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The locale prefix of a path, for the realtime tab's "which language are
 * they reading in" breakdown.
 *
 * lib/public-paths.ts's stripLocale() throws this away, which is right for
 * everything that uses it — a Redirect row and a slug lookup are keyed on
 * the path alone. Here it is the answer, so it is read separately rather
 * than by changing what stripLocale returns and rippling through the four
 * screens that depend on the current behaviour.
 *
 * No `server-only`: the same function is useful to a client component
 * deciding what to display, and it imports nothing but the locale list.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { defaultLocale, locales, type Locale } from "@/i18n";

/**
 * "/th/projects/x" → "th". Falls back to the default locale for a path
 * with no prefix, which is what a bare "/" is.
 */
export function localeOf(pathOrUrl: string): Locale {
  const withoutQuery = pathOrUrl.split(/[?#]/)[0];
  const match = withoutQuery.match(new RegExp(`^/(${locales.join("|")})(/.*|$)`));

  return (match?.[1] as Locale) ?? defaultLocale;
}
