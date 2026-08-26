"use client";

/**
 * components/CookiePreferencesLink.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The footer's "Cookie Preferences" entry. A <button>, not a route — there
 * is no dedicated page, it just reopens CookieConsentBanner in customise
 * mode via the same event lib/cookie-consent.ts's openConsentManager()
 * dispatches. Split out from Footer.tsx (a server component) because this
 * one line is the only part of the footer that needs to run in the
 * browser.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { openConsentManager } from "@/lib/cookie-consent";

export default function CookiePreferencesLink({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={openConsentManager}
      className="transition-colors hover:text-white"
    >
      {label}
    </button>
  );
}
