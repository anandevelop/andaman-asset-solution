/**
 * lib/redirect-paths.ts
 * ─────────────────────────────────────────────────────────────────────────
 * How a redirect's paths are written down, and how a target becomes a URL.
 *
 * Redirect rows are locale-relative ("/projects/old-slug"): one row covers
 * /en, /th, /zh and /ru. But the admin form takes whatever is pasted, and
 * what gets pasted is the URL from the address bar — "/en/projects/old",
 * or the whole "https://andamanassetsolution.com/en/projects/old". A row
 * saved like that never matched, so the page 404'd with its redirect set
 * (trinity-village-2, victory-victory-2), and a target saved as "/en" came
 * out as /en/en.
 *
 * Pure: the admin action, the lookup and the tests all use it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { locales } from "@/i18n";

const SITE_HOSTS = ["andamanassetsolution.com", "www.andamanassetsolution.com"];
const LOCALE_PREFIX = new RegExp(`^/(${locales.join("|")})(?=/|$)`);

/**
 * "/en/projects/old/", "https://andamanassetsolution.com/th/projects/old?x"
 * → "/projects/old". A bare locale ("/en") becomes "/". Anything on another
 * host is returned unchanged — only a target may be one.
 */
export function normaliseRedirectPath(raw: string): string {
  let value = raw.trim();
  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return value;
    }
    if (!SITE_HOSTS.includes(url.hostname.toLowerCase())) return value;
    value = url.pathname;
  }
  value = value.split(/[?#]/)[0] || "/";
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(LOCALE_PREFIX, "") || "/";
  if (value.length > 1) value = value.replace(/\/+$/, "");
  return value || "/";
}

/** True for a target on another site, which is sent as it is. */
export function isExternalTarget(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

/**
 * Where to send a visitor who asked for a page in `locale`: an external
 * target unchanged; one already carrying a locale ("/en/…", saved before
 * targets were normalised) unchanged; anything else in the visitor's own
 * language.
 */
export function redirectDestination(locale: string, toPath: string): string {
  if (isExternalTarget(toPath)) return toPath;
  if (LOCALE_PREFIX.test(toPath)) return toPath;
  return `/${locale}${toPath === "/" ? "" : toPath}`;
}

/**
 * The fromPath values a request for `path` in `locale` may have been
 * saved under: the locale-relative form, and the same with each locale in
 * front, for rows saved from a pasted address before normalising.
 */
export function redirectLookupKeys(path: string): string[] {
  const base = normaliseRedirectPath(path);
  return [base, ...locales.map((l) => `/${l}${base === "/" ? "" : base}`)];
}
