"use client";

/**
 * components/RecaptchaProvider.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Loads the reCAPTCHA v3 script and exposes a token getter.
 *
 * The script is loaded lazily rather than in the document head. v3 runs
 * continuously once loaded, watching pointer and keyboard behaviour, and
 * it injects a fixed-position badge — neither belongs on a page with no
 * form on it. Pages that need it mount this; everything else stays clean.
 *
 * `useRecaptchaToken()` returns null when the key is unset, which is what
 * lets the whole feature be optional: the form submits without a token and
 * lib/recaptcha skips verification server-side.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Script from "next/script";
import { useCallback } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export default function RecaptchaProvider() {
  if (!SITE_KEY) return null;

  return (
    <Script
      src={`https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`}
      strategy="lazyOnload"
    />
  );
}

/**
 * Mint a token for one submission.
 *
 * Tokens are single-use and expire after two minutes, so this must be
 * called at submit time — not on mount. Calling it early is the most
 * common way to end up with timeout-or-duplicate rejections.
 */
export function useRecaptchaToken() {
  return useCallback(async (action: string): Promise<string | null> => {
    if (!SITE_KEY || typeof window === "undefined" || !window.grecaptcha) {
      return null;
    }

    try {
      // grecaptcha.ready resolves once the script has finished initialising;
      // on a slow connection the submit can beat it.
      await new Promise<void>((resolve) => window.grecaptcha!.ready(resolve));
      return await window.grecaptcha!.execute(SITE_KEY, { action });
    } catch (error) {
      // A failure here must not block the submission — the server treats a
      // missing token from an unreachable Google as a skip.
      console.warn("[recaptcha] could not mint a token", error);
      return null;
    }
  }, []);
}
