/**
 * lib/runtime-headers.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The two response headers that differ between staging and production on
 * the same image: the Content-Security-Policy (Report-Only or enforced) and
 * the site-wide `X-Robots-Tag: noindex`. Set by proxy.ts on every request
 * it handles, reading CSP_ENFORCE and SITE_INDEXABLE at request time.
 *
 * WHY NOT next.config.js headers()
 *
 * That is where both used to be. headers() runs at build and is written
 * into routes-manifest.json, which is all a production server reads; the
 * Docker build has neither variable, so every image answered Report-Only
 * and noindex for ever. Setting SITE_INDEXABLE=true on the production
 * container, as the launch checklist says to, would have left the new
 * site invisible to Google with nothing on screen to say why.
 *
 * WHAT THIS DOES NOT COVER
 *
 * proxy.ts skips /api, /_next and any path with a dot, so static files and
 * images get neither header. Neither matters for them: a CSP governs
 * documents, and on staging robots.txt (app/robots.ts, now rendered per
 * request too) still disallows everything.
 *
 * Staging and production are one container (lib/indexing.ts
 * isCanonicalHost), so the noindex also follows the request's Host: the
 * sslip.io address stays noindex after SITE_INDEXABLE=true.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { isIndexableRequest } from "@/lib/indexing";

/** Built in next.config.js from CSP_DIRECTIVES and inlined through `env`. */
const POLICY_REPORT_ONLY = process.env.CSP_POLICY_REPORT_ONLY ?? "";
const POLICY_ENFORCED = process.env.CSP_POLICY_ENFORCED ?? "";

export function cspEnforced(): boolean {
  return process.env.CSP_ENFORCE === "true";
}

/** The CSP header for this request, as [name, value], or null if the
 *  policy was not built in (a test environment with no next.config). */
export function cspHeader(): [string, string] | null {
  if (cspEnforced()) {
    return POLICY_ENFORCED ? ["Content-Security-Policy", POLICY_ENFORCED] : null;
  }
  return POLICY_REPORT_ONLY ? ["Content-Security-Policy-Report-Only", POLICY_REPORT_ONLY] : null;
}

/** `host` is the request's Host header: only the canonical host is ever
 *  indexable, see lib/indexing.ts isCanonicalHost. */
export function applyRuntimeHeaders(headers: Headers, host: string | null): void {
  const csp = cspHeader();
  if (csp) headers.set(csp[0], csp[1]);

  /*
    Anything that is not the canonical site, by its environment or by the
    host it was reached at, gets noindex on every page, not only in
    robots.txt: robots.txt asks a crawler not to fetch, this tells one that
    fetched anyway not to index. It also covers the pages that set their own
    `robots: { index: true }` metadata (privacy-policy, terms). Admin and
    login carry their own noindex from next.config.js whatever this says.
  */
  if (!isIndexableRequest(host)) headers.set("X-Robots-Tag", "noindex, nofollow");
}
