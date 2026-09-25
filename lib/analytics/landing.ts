/**
 * lib/analytics/landing.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Where a visit began: the first path of the session and the host that
 * sent them.
 *
 * WHY THIS IS NOT sourcePath
 *
 * LeadInquiry.sourcePath is the page the form was submitted on, and that is
 * the right thing for it to be — "which page produced this enquiry" is a
 * real question. It just cannot answer a different one. Somebody who
 * arrives from Google on an article, reads it, then fills in the form at
 * /contact is recorded with sourcePath "/contact", and attributing that
 * lead to search is impossible after the fact.
 *
 * Nor can utm: organic search carries no utm parameters, so the leads that
 * matter most for an SEO report are precisely the ones utm cannot see.
 *
 * So the landing page and the referring host are recorded separately, by
 * components/PageViewBeacon.tsx on the first page of the visit, and sent
 * with the form the same way utm already is. The meaning of sourcePath is
 * unchanged.
 *
 * HOST ONLY, NEVER THE FULL REFERRER
 *
 * "www.google.co.th" answers the question — search, social, or direct. The
 * full referring URL would be a record of what somebody was reading
 * somewhere else, which this site has no business storing against a named
 * person's phone number.
 *
 * No `server-only`: the browser writes it and the form reads it.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** One key, per tab. sessionStorage, so it lasts exactly one visit. */
export const LANDING_STORAGE_KEY = "andaman.landing";

export type LandingAttribution = {
  /** Locale-prefixed, as the visitor saw it: "/th/projects/victory". */
  path: string;
  /** Host only, or "" for a direct visit or a referrer we could not read. */
  referrer: string;
};

/** What LeadForm sends. Empty strings rather than nulls, matching how the
 *  form already handles utm, so one shape goes over the wire. */
export const EMPTY_LANDING: LandingAttribution = { path: "", referrer: "" };

/**
 * Read back what the beacon stored, defensively.
 *
 * This is parsed sessionStorage — a value anybody with devtools can write —
 * so anything that is not the expected shape is treated as absent rather
 * than trusted into a database column.
 */
export function readLanding(): LandingAttribution {
  if (typeof window === "undefined") return EMPTY_LANDING;

  try {
    const raw = window.sessionStorage.getItem(LANDING_STORAGE_KEY);
    if (!raw) return EMPTY_LANDING;

    const parsed = JSON.parse(raw) as Partial<LandingAttribution>;
    if (typeof parsed?.path !== "string") return EMPTY_LANDING;

    return {
      path: parsed.path.slice(0, 500),
      referrer: typeof parsed.referrer === "string" ? parsed.referrer.slice(0, 255) : "",
    };
  } catch {
    return EMPTY_LANDING;
  }
}

/**
 * Whether a landing referrer is a search engine — the test phase 6's
 * "leads from Google" figure is built on.
 *
 * Deliberately narrow and deliberately not "contains google": a referrer of
 * "google.evil.test" is not Google, and a report that counted it would be
 * wrong in the direction that flatters the channel being measured.
 */
export function isSearchReferrer(referrer: string): boolean {
  const host = referrer.trim().toLowerCase();
  if (!host) return false;

  return SEARCH_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

const SEARCH_HOST_PATTERNS = [
  // google.com, www.google.co.th, news.google.com …
  /(^|\.)google(\.[a-z]{2,3}){1,2}$/,
  /(^|\.)bing\.com$/,
  /(^|\.)duckduckgo\.com$/,
  /(^|\.)search\.yahoo\.com$/,
  /(^|\.)yandex\.(com|ru)$/,
  /(^|\.)baidu\.com$/,
];
