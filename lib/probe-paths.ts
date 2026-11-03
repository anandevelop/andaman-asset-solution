/**
 * lib/probe-paths.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Requests that are a scanner looking for secrets, never a page.
 *
 * Bots try /.env, /.git/config, /id_rsa, /Dockerfile, /proc/self/environ,
 * /wp-login.php … on every site they find. Nothing of the sort is served
 * here — the image holds only public/ and the build output, and
 * .dockerignore keeps .env, .git and the compose files out of it — so each
 * of them was already a 404. But each one still rendered the full 404
 * page, looked up a redirect, and was written into the "dead ends" lists
 * on /admin/seo/urls and /admin/seo/indexing, where it buried the broken
 * links that matter.
 *
 * proxy.ts answers these with a bare 404 before anything else runs, and
 * the 404 logs skip them. Pure, so the list is testable.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { locales } from "@/i18n";

const LOCALE_PREFIX = new RegExp(`^/(${locales.join("|")})(?=/|$)`);

/** Any segment starting with a dot, except the standard /.well-known/. */
const DOT_SEGMENT = /(^|\/)\.(?!well-known(\/|$))[^/]*/;

const PROBES: readonly RegExp[] = [
  /^\/proc(\/|$)/,
  /^\/(etc|root|var|usr|home|bin|tmp)\//,
  /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519|authorized_keys|known_hosts)(\.pub)?$/i,
  /(^|\/)(dockerfile|docker-compose[^/]*\.ya?ml|compose\.ya?ml)$/i,
  /\.(env|pem|key|p12|pfx|sql|sqlite|db|bak|backup|old|swp|log|ini|conf|cfg|php\d?|asp|aspx|jsp|cgi)$/i,
  /(^|\/)(wp-admin|wp-login|wp-content|wp-includes|xmlrpc|phpmyadmin|pma|cgi-bin|server-status|actuator|vendor\/phpunit|_profiler|telescope)(\/|$|\.)/i,
  /(^|\/)(config|credentials|secrets?)\.(json|ya?ml|js|ts)$/i,
  /\.\.(\/|$)/,
];

/** True for a path that is a probe for a file this site never serves. */
export function isProbePath(rawPath: string): boolean {
  let path = rawPath.split(/[?#]/)[0] ?? "";
  try {
    path = decodeURIComponent(path);
  } catch {
    // A malformed escape is itself a scanner's signature.
    return true;
  }
  path = path.replace(LOCALE_PREFIX, "") || "/";
  if (DOT_SEGMENT.test(path)) return true;
  return PROBES.some((pattern) => pattern.test(path));
}
