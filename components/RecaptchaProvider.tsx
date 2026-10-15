"use client";

/**
 * components/RecaptchaProvider.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Loads the reCAPTCHA v3 script and exposes a token getter.
 *
 * The script is loaded the first time a visitor touches a form — focus or
 * a tap inside it (`loadRecaptcha`, wired to the form's onFocusCapture /
 * onPointerDownCapture) — not when the page loads. It is ~850 KB of
 * Google JavaScript plus an iframe; on a project page, where the form is
 * the last section and most visitors never fill it in, loading it up front
 * was the largest single cost in Lighthouse. v3 still watches the visitor
 * for the whole time they spend filling the form in, which is the part
 * that scores a submission.
 *
 * `useRecaptchaToken()` also loads it on demand, so a submit that somehow
 * beat the focus (autofill + Enter) still gets a token if Google answers
 * within a few seconds. It returns null when the key is unset or Google is
 * unreachable — the form submits without a token and lib/recaptcha skips
 * verification server-side, which is what keeps the feature optional.
 * ─────────────────────────────────────────────────────────────────────────
 */

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
/** How long a submit waits for a script it had to start loading itself. */
const SUBMIT_LOAD_TIMEOUT_MS = 5000;

let loading: Promise<void> | null = null;

/** Inject the v3 script once per page. Safe to call on every focus. */
export function loadRecaptcha(): Promise<void> {
  if (!SITE_KEY || typeof window === "undefined") return Promise.resolve();
  if (window.grecaptcha) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve) => {
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        // Let a later focus or submit try again.
        loading = null;
        script.remove();
        resolve();
      };
      document.head.appendChild(script);
    });
  }
  return loading;
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
    if (!SITE_KEY || typeof window === "undefined") return null;

    try {
      if (!window.grecaptcha) {
        await Promise.race([
          loadRecaptcha(),
          new Promise((resolve) => setTimeout(resolve, SUBMIT_LOAD_TIMEOUT_MS)),
        ]);
      }
      if (!window.grecaptcha) return null;
      // grecaptcha.ready resolves once the script has finished initialising;
      // on a slow connection the submit can beat it.
      await new Promise<void>((resolve) => window.grecaptcha!.ready(resolve));
      return await window.grecaptcha.execute(SITE_KEY, { action });
    } catch (error) {
      // A failure here must not block the submission — the server treats a
      // missing token from an unreachable Google as a skip.
      console.warn("[recaptcha] could not mint a token", error);
      return null;
    }
  }, []);
}
