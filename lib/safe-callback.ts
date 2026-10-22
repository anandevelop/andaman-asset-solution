/**
 * lib/safe-callback.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Where the login form may send someone after they sign in.
 *
 * The login page used to accept anything starting with "/" and not "//".
 * "/\evil.example" and "/<TAB>/evil.example" pass that test, and a browser
 * resolves both to https://evil.example/. So a link to our real login page
 * could send staff, freshly signed in, to a fake "session expired, enter
 * your password and 2FA code again" page.
 *
 * Now the value is resolved the way a browser would, must stay on this
 * origin, and must be an admin page. proxy.ts only ever sets it to the
 * admin path that bounced to the login, so nothing legitimate is lost.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { adminLocales } from "@/i18n";

const ORIGIN = "https://origin.invalid";
const ADMIN = new RegExp(`^/(${adminLocales.join("|")})/admin(?:/|$)`);

export function safeCallbackUrl(raw: string | null | undefined, locale: string): string {
  const fallback = `/${locale}/admin`;
  if (!raw) return fallback;
  // Backslashes and control characters are how the bypasses are spelled.
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== ORIGIN || !ADMIN.test(url.pathname)) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
