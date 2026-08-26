/**
 * lib/cookie-consent.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Cookie consent state — read/write plus a hook, no framework.
 *
 * Two categories beyond the cookies the site cannot function without:
 *   - analytics  → gates GA4 (components/Analytics.tsx)
 *   - marketing  → gates the Meta Pixel (same file)
 *
 * The default, before a visitor decides anything, is "off" for both — an
 * opt-in posture, not opt-out. components/Analytics.tsx renders neither
 * script until this module reports consent, so under PDPA nothing beyond
 * strictly-necessary cookies is ever set without a decision.
 *
 * No React Context. The consent decision and the banner's "please reopen
 * yourself" trigger are both small, infrequent, cross-tree signals (the
 * footer link and the banner are siblings, not parent/child), so a plain
 * `window` CustomEvent is less code than wiring a Provider through
 * app/[locale]/(site)/layout.tsx for two events total. lib/analytics.ts
 * takes the same no-framework approach.
 *
 * Versioned against siteConfig.legal.consentVersion — the same string
 * every LeadInquiry/EventRegistration stamps into its PDPA consent trail,
 * and the version shown on /privacy-policy. Bumping it (because the
 * cookie section changed) invalidates every stored decision at once: the
 * banner reappears rather than silently carrying forward a choice made
 * under different wording.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import { siteConfig } from "@/config/site";

export type ConsentDecision = {
  analytics: boolean;
  marketing: boolean;
};

type StoredConsent = ConsentDecision & {
  version: string;
  decidedAt: string;
};

const STORAGE_KEY = "andaman-cookie-consent";

/** Fired on window whenever the decision changes, `detail` is the new
 *  ConsentDecision — lets every mounted Analytics instance react without a
 *  page reload. */
export const CONSENT_CHANGE_EVENT = "andaman:cookie-consent-change";

/** Fired by the footer's "Cookie Preferences" link — tells the banner to
 *  reopen in customise mode even though a decision already exists. */
export const CONSENT_OPEN_EVENT = "andaman:cookie-consent-open";

export function readStoredConsent(): ConsentDecision | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.version !== siteConfig.legal.consentVersion) return null;

    return {
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
    };
  } catch {
    // Corrupted value (hand-edited, a very old shape, private-browsing
    // quirks) — treat exactly like "never decided".
    return null;
  }
}

export function writeConsent(decision: ConsentDecision): void {
  if (typeof window === "undefined") return;

  const stored: StoredConsent = {
    ...decision,
    version: siteConfig.legal.consentVersion,
    decidedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage full or blocked (private browsing in some browsers) — the
    // choice still applies for the rest of this page load via the event
    // below, it just won't be remembered on the next visit.
  }

  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: decision }));

  // First-party, anonymous, cookie-less counter increment — not the
  // tracking this banner exists to gate. It sets no cookie, sends no
  // identifier, and only feeds the admin dashboard's aggregate "% granted"
  // figure (lib/cookie-consent-stats.ts), so it does not wait for consent.
  // Fire-and-forget: a visitor closing the banner must never wait on this.
  fetch("/api/cookie-consent-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(decision),
    keepalive: true,
  }).catch(() => {
    // Offline, blocked by an extension, whatever — the decision is already
    // saved locally and already applied for this page load either way.
  });
}

/** Called by the footer's "Cookie Preferences" link. */
export function openConsentManager(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

/**
 * `consent` is `null` until the first effect runs (SSR has no
 * localStorage, so this always starts `null` to avoid a hydration
 * mismatch) and stays `null` for a first-time visitor who hasn't decided
 * yet — both components/CookieConsentBanner.tsx and components/Analytics.tsx
 * treat `null` as "not granted", they just disagree on what to do about
 * it (show itself vs. stay silent).
 */
export function useCookieConsent(): { consent: ConsentDecision | null; ready: boolean } {
  const [consent, setConsent] = useState<ConsentDecision | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setConsent(readStoredConsent());
    setReady(true);

    const onChange = (event: Event) => {
      setConsent((event as CustomEvent<ConsentDecision>).detail);
    };

    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  }, []);

  return { consent, ready };
}
