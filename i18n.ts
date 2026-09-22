import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";

export const locales = ["en", "th", "zh", "ru"] as const;
export type Locale = (typeof locales)[number];

/**
 * The order the four languages are *shown* in across the admin — Thai
 * first, because it is this site's primary content language and the one an
 * editor fills in first.
 *
 * Deliberately not `locales` above, whose order is about resolution
 * fallback (English is the base locale) and has nothing to do with
 * presentation. Lives here rather than in lib/locale-completeness.ts so
 * client components — the media library's alt-text editor, for one — can
 * read it; that module is server-only.
 */
export const LOCALE_DISPLAY_ORDER = ["th", "en", "zh", "ru"] as const;
export const defaultLocale: Locale = "th";

/**
 * Locales the admin backend's own UI (chrome, labels, dates — not content)
 * is reachable under. Separate from `locales` above: every admin
 * content-editing screen still manages all four `locales` for the public
 * site's own translations regardless of this list — this only restricts
 * which language the admin interface itself renders in, since editors only
 * ever use Thai or English. See proxy.ts, which redirects /admin and
 * /login off any other locale prefix, and AdminTopbar.tsx's switcher.
 */
export const adminLocales = ["th", "en"] as const satisfies readonly Locale[];

/**
 * next-intl ≥3.22 deprecated the `locale` argument in favour of the
 * `requestLocale` promise, and now expects the resolved locale to be
 * returned alongside the messages. Returning it is not cosmetic: without
 * it the library falls back to its own guess, and the omission is an
 * outright error in next-intl 4.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  // proxy.ts only ever routes a known locale through here, so anything
  // else is a hand-typed URL — 404 rather than silently serving Thai.
  if (!locales.includes(requested as Locale)) notFound();

  const locale = requested as Locale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
