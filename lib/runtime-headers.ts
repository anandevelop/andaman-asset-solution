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
 * ─────────────────────────────────────────────────────────────────────────
 */

import { isSiteIndexable } from "@/lib/indexing";

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

export function applyRuntimeHeaders(headers: Headers): void {
  const csp = cspHeader();
  if (csp) headers.set(csp[0], csp[1]);

  /*
    Anything that has not declared itself the canonical site gets noindex
    on every page, not only in robots.txt: robots.txt asks a crawler not to
    fetch, this tells one that fetched anyway not to index. It also covers
    the pages that set their own `robots: { index: true }` metadata
    (privacy-policy, terms). Admin and login carry their own noindex from
    next.config.js whatever this says.
  */
  if (!isSiteIndexable()) headers.set("X-Robots-Tag", "noindex, nofollow");
}
