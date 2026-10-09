/**
 * i18n-request.ts
 * ─────────────────────────────────────────────────────────────────────────
 * next-intl's request config — the file next.config.js hands the plugin.
 *
 * It used to be the default export of i18n.ts, beside the locale
 * constants. It moved when loading messages started to read the database
 * (the admin's copy overrides): client components import i18n.ts for
 * those constants, and a server-only module reachable from it — even
 * through a dynamic import — is a build error in a client bundle.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";
import { locales, type Locale } from "@/i18n";
import { getCopyOverrides } from "@/lib/site-copy";
import { applyCopyOverrides } from "@/lib/site-copy-core";

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
  // else is a hand-typed URL — 404 rather than silently serving the default.
  if (!locales.includes(requested as Locale)) notFound();

  const locale = requested as Locale;

  /* The admin's copy overrides (/admin/pages/copy) laid over the JSON —
     only the public namespaces, only keys the JSON has. See
     lib/site-copy-core.ts. */
  const site = applyCopyOverrides(
    (await import(`./messages/${locale}.json`)).default as Record<string, unknown>,
    await getCopyOverrides(locale),
  );

  return {
    locale,
    messages: {
      ...site,
    },
  };
});
