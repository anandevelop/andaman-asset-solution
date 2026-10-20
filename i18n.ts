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

/**
 * The language a visitor gets when nothing else decides it.
 *
 * English, because the buyers this site is for are mostly not Thai — it is
 * what `/` redirects to, what `x-default` points at in the sitemap and
 * hreflang tags, and what the error boundaries fall back to on a URL with
 * no locale segment.
 *
 * It is also the only thing that decides where a URL with no locale goes.
 * proxy.ts runs next-intl's middleware with `localeDetection: false`, so
 * neither the browser's accept-language nor a remembered NEXT_LOCALE
 * cookie sends a visitor to /th: the owners want the English site first.
 * Until 2026-10-20 detection was on, and a Thai-language browser opened
 * andamanassetsolution.com in Thai.
 *
 * Deliberately separate from LOCALE_DISPLAY_ORDER above, which is Thai-first
 * because the people filling the admin in are Thai. Who writes the content
 * and who reads it are different questions.
 */
export const defaultLocale: Locale = "en";

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
