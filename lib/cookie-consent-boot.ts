/**
 * lib/cookie-consent-boot.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The part of cookie consent a Server Component may import: the storage
 * key and the inline script the public layout puts in front of the banner.
 * lib/cookie-consent.ts imports React hooks, which a server file cannot.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { siteConfig } from "@/config/site";

export const CONSENT_STORAGE_KEY = "andaman-cookie-consent";

/**
 * Runs in the page's HTML, before the banner's own markup is parsed, and
 * marks <html> when this browser already holds a decision under the
 * current version. app/styles/shared-late.css hides the server-rendered
 * banner under that mark.
 *
 * It exists because the banner is in the HTML now. It used to mount after
 * hydration, and on a text page (contact, a policy) its paragraph is the
 * largest thing on a phone's screen — so the page's Largest Contentful
 * Paint was "whenever the JavaScript finished": 5.4 s against a first
 * paint at 1.2 s in the throttled mobile run. Rendered on the server it
 * paints with everything else; this script is what keeps a returning
 * visitor from seeing it flash.
 *
 * The same test as readStoredConsent() in lib/cookie-consent.ts — keep the
 * two in step.
 * Static apart from the two constants, which are ours: no user input.
 */
export const CONSENT_BOOT_SCRIPT = `(function(){try{var r=localStorage.getItem(${JSON.stringify(
  CONSENT_STORAGE_KEY,
)});if(!r)return;if(JSON.parse(r).version===${JSON.stringify(
  siteConfig.legal.consentVersion,
)})document.documentElement.setAttribute("data-cookie-decided","")}catch(e){}})()`;
