import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";

export const locales = ["en", "th", "zh", "ru"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "th";

/**
 * next-intl ≥3.22 deprecated the `locale` argument in favour of the
 * `requestLocale` promise, and now expects the resolved locale to be
 * returned alongside the messages. Returning it is not cosmetic: without
 * it the library falls back to its own guess, and the omission is an
 * outright error in next-intl 4.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  // middleware.ts only ever routes a known locale through here, so anything
  // else is a hand-typed URL — 404 rather than silently serving Thai.
  if (!locales.includes(requested as Locale)) notFound();

  const locale = requested as Locale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
