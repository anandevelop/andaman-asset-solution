/**
 * lib/public-paths.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The shape of every URL this site actually serves, as data.
 *
 * Two screens need to answer "would a visitor get a page here?" without
 * fetching it — the broken-link scan, and the 404 worklist deciding
 * whether a path is one typo away from something real. Both need the same
 * answer, so it is written once.
 *
 * STATIC_PATHS is hand-maintained, which would normally be a staleness
 * bug waiting to happen: add a page, forget this file, and the scan starts
 * calling a live URL broken. tests/public-paths.test.ts reads the route
 * folder and fails when the two disagree, so the list cannot drift without
 * the suite saying which page was added.
 *
 * No `server-only` marker and no imports beyond the locale list: the 404
 * worklist renders these comparisons in a client component too.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { locales } from "@/i18n";

/**
 * Locale-relative paths served by a page with no dynamic segment.
 *
 * "/" is the home page. Everything else mirrors a folder under
 * app/[locale]/(site).
 */
export const STATIC_PATHS = [
  "/",
  "/about",
  "/achievements",
  "/contact",
  "/e-brochure",
  "/events",
  "/news",
  "/privacy-policy",
  "/progress",
  "/projects",
  "/terms",
] as const;

/**
 * The four prefixes whose next segment is a slug in the database, mapped
 * to the Prisma model that owns it. Anything under one of these can be
 * checked for real; anything else can only be compared against
 * STATIC_PATHS.
 */
export const SLUG_PREFIXES = {
  "/projects": "project",
  "/news": "newsArticle",
  "/events": "event",
  "/e-brochure": "eBrochure",
} as const;

export type SlugPrefix = keyof typeof SLUG_PREFIXES;

/**
 * Pages reachable by a visitor with no individually-trackable
 * (contentType, contentId) identity — see lib/admin/link-health.ts's
 * orphan scan, which is scoped to Project/NewsArticle/Event records and
 * so would rarely if ever need this in practice. Kept deliberately small
 * and separate from STATIC_PATHS, most of whose other entries (/about,
 * /projects, /news) are section-listing pages that would need real
 * per-item orphan logic of their own, not a blanket exemption.
 */
export const SYSTEM_PATHS = ["/privacy-policy", "/terms"] as const;

/** "/th/projects/x?utm=1#top" → "/projects/x". Query and hash dropped: a
 *  Redirect row and a slug lookup are both keyed on the path alone. */
export function stripLocale(pathOrUrl: string): string {
  const withoutQuery = pathOrUrl.split(/[?#]/)[0];
  const match = withoutQuery.match(new RegExp(`^/(${locales.join("|")})(/.*|$)`));
  const path = match ? match[2] || "/" : withoutQuery;

  // "/projects/" and "/projects" are the same page to Next; treating them
  // as different paths would report one of them broken.
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Does `pathname` fall under `target`?
 *
 * The rule the closing CTA's page assignments are written in: a section
 * stands for everything inside it, so "/projects" covers /projects and
 * every development under it. "/" is the exception — as a prefix it would
 * match the entire site, so it matches only the home page.
 *
 * Shared by components/RouteGate.tsx, which does this check in the
 * browser, and by lib/site-cta.ts's tests, which check that a page ends up
 * with exactly one CTA. Two implementations of this would be two answers
 * to "which page is this", and the test would be verifying its own copy.
 */
export function routeMatches(pathname: string, target: string): boolean {
  const path = stripLocale(pathname);

  if (target === "/") return path === "/";
  return path === target || path.startsWith(`${target}/`);
}

/**
 * Would a visitor get a page here?
 *
 * The rule /api/page-view counts by. It used to count only "/news/", which
 * kept the table small by the crude method of ignoring most of the site;
 * phase 3 needs every public page, and "every public page" has to mean
 * something narrower than "every path a crawler can invent" or one row per
 * day per invented URL lands in path_hit_days forever.
 *
 * So it is the two lists this file already maintains: a static page, or a
 * slug under one of the four content prefixes. /admin, /login, /api and
 * anything a bot made up are none of those and are ignored — quietly, as
 * the endpoint has always done, because a counter is never worth an error
 * in a reader's console.
 */
export function isCountablePublicPath(path: string): boolean {
  if ((STATIC_PATHS as readonly string[]).includes(path)) return true;
  return slugPrefixOf(path) !== null;
}

/** The slug prefix this path sits under, or null. */
export function slugPrefixOf(path: string): SlugPrefix | null {
  for (const prefix of Object.keys(SLUG_PREFIXES) as SlugPrefix[]) {
    if (path.startsWith(`${prefix}/`) && path.slice(prefix.length + 1).length > 0) return prefix;
  }
  return null;
}

/** "/projects/andaman-bay-villa" → "andaman-bay-villa". */
export function slugOf(path: string, prefix: SlugPrefix): string {
  return path.slice(prefix.length + 1).split("/")[0];
}

/** Has a file extension — "/brochures/floorplan.pdf". These never match a
 *  page route, so a 404 on one is a moved file, not a moved page. */
export function looksLikeFile(path: string): boolean {
  return /\.[a-z0-9]{2,5}$/i.test(path);
}

/**
 * Paths nobody typed and no page ever served — a bot walking a list of
 * filenames from some other CMS. Kept short and specific on purpose: it
 * only decides which suggestion the admin screen offers, and calling a
 * real mistyped URL "a bot" would hide something worth fixing.
 */
const BOT_PATTERNS = [
  /^\/wp-/,
  /^\/wordpress\b/,
  /^\/xmlrpc\.php$/,
  /^\/sitemap[-_]?\w*\.xml$/,
  /^\/\.env/,
  /^\/\.git/,
  /^\/vendor\//,
  /^\/administrator\b/,
  /^\/phpmyadmin\b/i,
  /^\/cgi-bin\//,
  /\.(php|asp|aspx|jsp|cgi)$/i,
];

export function looksLikeBotProbe(path: string): boolean {
  return BOT_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Edit distance, capped, counting a swap of two neighbouring characters as
 * one edit rather than two (optimal string alignment).
 *
 * The transposition case is not a refinement — it is the whole reason this
 * works. "porjects" for "projects" is the single most common way a URL
 * gets mistyped, and plain Levenshtein scores it 2, the same as two
 * unrelated wrong letters. Scoring it 1 is what lets the threshold stay
 * tight enough to refuse "/promo" while still catching the typo.
 *
 * Capped because the only question asked of it is "is this within a typo
 * or two", so the exact figure past the cap is of no interest and
 * computing it is wasted work on a long string.
 */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  // Three rows: the one before last is what a transposition looks back at.
  let twoBack: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowBest = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoBack[j - 2] + 1);
      }

      current[j] = value;
      rowBest = Math.min(rowBest, value);
    }

    // Every remaining row can only add, so once a whole row is past the
    // cap the answer is past the cap.
    if (rowBest > cap) return cap + 1;
    twoBack = previous;
    previous = current;
  }

  return previous[b.length];
}

/**
 * The closest live path to a mistyped one, or null when nothing is near
 * enough to suggest with a straight face.
 *
 * The threshold scales with length — one character wrong in "/contact" is
 * a different level of confidence from one character wrong in a
 * forty-character slug — and a candidate must at least share the first
 * character, which keeps "/promo" from being offered as the fix for
 * "/villa".
 */
export function closestPath(path: string, candidates: readonly string[]): string | null {
  const cap = path.length <= 10 ? 1 : path.length <= 25 ? 2 : 3;

  let best: string | null = null;
  let bestDistance = cap + 1;

  for (const candidate of candidates) {
    if (candidate === path) return candidate;
    if (candidate[1] !== path[1]) continue;

    const distance = editDistance(path, candidate, cap);
    if (distance <= cap && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}
