/**
 * lib/localize-href.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A link an editor typed, given the reader's locale.
 *
 * Editors type site paths the way they read them: "/projects/residence-
 * prime". On /en that link went through the proxy's locale step, and since
 * config/legacy-redirects.js maps bare /projects/:slug to /th (the old site's
 * Thai URLs), an English visitor clicking the home hero's button landed on
 * the Thai page. A path already carrying a locale, an external URL, a
 * mailto:/tel:, an anchor or a file is left exactly as typed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { locales } from "@/i18n";

export function localizeHref(href: string, locale: string): string {
  const value = href.trim();
  // Only a site path: "/x". Not "//host", not "https:", "mailto:", "#top".
  if (!value.startsWith("/") || value.startsWith("//")) return value;

  const first = value.split(/[/?#]/)[1] ?? "";
  if ((locales as readonly string[]).includes(first)) return value;
  // Files and API routes have no locale: /brochures/a.pdf, /api/...
  if (first === "api" || /\.[a-z0-9]{2,5}$/i.test(value.split(/[?#]/)[0])) return value;

  return value === "/" ? `/${locale}` : `/${locale}${value}`;
}
