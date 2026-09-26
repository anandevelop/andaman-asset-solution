"use client";

/**
 * components/WebVitalsBeacon.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Reports what the page actually felt like, from the visitor's own device.
 * Renders nothing.
 *
 * Same shape as PageViewBeacon next door: sendBeacon where it exists
 * because it survives the page being closed, a ref guarding React's
 * development double-mount so one visit is not measured twice, and every
 * failure swallowed — a measurement is never worth an error in a reader's
 * console.
 *
 * ONLY WITH CONSENT, AND IT CAN ARRIVE LATE
 *
 * Nothing is sent unless the visitor accepted the analytics cookie. The
 * banner is answered after the page has loaded, so LCP and TTFB have
 * usually already fired by then — the reports are held and flushed if
 * consent arrives, and dropped if it does not. Registering the listeners
 * only after consent would mean never measuring the metric that matters
 * most, since LCP happens once and does not happen again.
 *
 * WHY IT SUBSCRIBES ONCE AND NOT PER PATH
 *
 * web-vitals reports per page load, and its own listeners handle a
 * client-side navigation. Re-subscribing on every path change would
 * register a second set and double-count.
 *
 * INP AND CLS ARRIVE AT THE END
 *
 * Both are only final when the visit is — a layout shift can happen at any
 * moment and INP is the worst interaction of the whole visit. web-vitals
 * reports them on visibilitychange, which is why sendBeacon rather than
 * fetch is load-bearing here rather than a nicety: the page is already
 * going away.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from "react";
import { useCookieConsent } from "@/lib/cookie-consent";
import type { VitalKey } from "@/lib/analytics/vitals";

type Report = { metric: VitalKey; value: number; path: string };

type Props = {
  /** The build this page was served from, read on the server — see the
   *  (site) layout. Lets the dashboard mark a deploy on the graph instead
   *  of leaving somebody to guess which change made LCP worse. */
  commitSha: string | null;
};

export default function WebVitalsBeacon({ commitSha }: Props) {
  const { consent, ready } = useCookieConsent();

  const subscribed = useRef(false);
  /** Reports that fired before an answer to the banner. */
  const held = useRef<Report[]>([]);
  // Kept in a ref as well as in state: the web-vitals callbacks are
  // registered once and would otherwise close over the first render's
  // answer, which is always "not decided yet". Written in an effect and not
  // during render — a ref write during render is wrong under StrictMode,
  // and the lint rule that says so is an error here. It costs nothing: the
  // callbacks only read it once the dynamic import below has resolved,
  // which is long after the first commit.
  const allowed = useRef(false);

  // No cleanup, and that is the whole point.
  //
  // The obvious shape here is a `cancelled` flag set in the effect's
  // cleanup and checked when the dynamic import resolves. Paired with the
  // double-mount guard it silently measures nothing at all: StrictMode
  // mounts, cleans up — setting cancelled — then mounts again, where
  // `subscribed.current` is already true so the effect returns at once. The
  // import started by the *first* mount then resolves with cancelled true
  // and registers no listener, so LCP, INP, CLS and TTFB are never
  // subscribed for the life of the page. It fails without an error, in
  // development only, and the first three commits of this file had it.
  //
  // `subscribed` is the only guard needed. web-vitals' listeners belong to
  // the page rather than to this component — there is no unsubscribe API to
  // call — so a React unmount is not a reason to stop measuring.
  useEffect(() => {
    if (subscribed.current) return;
    subscribed.current = true;

    // Dynamically imported so the library is not in the bundle of a page
    // whose visitor never consents — and so nothing here runs during SSR.
    void import("web-vitals/attribution")
      .then(({ onLCP, onINP, onCLS, onTTFB }) => {
        const report = (metric: VitalKey) => (result: { value: number }) => {
          const entry: Report = {
            metric,
            value: result.value,
            path: window.location.pathname,
          };

          if (allowed.current) send([entry], commitSha);
          // Held rather than dropped: LCP has usually already fired by the
          // time the banner is answered, and it does not fire again.
          else held.current.push(entry);
        };

        onLCP(report("LCP"));
        onINP(report("INP"));
        onCLS(report("CLS"));
        onTTFB(report("TTFB"));
      })
      .catch(() => {
        // The library failed to load. Nothing to measure with, and
        // nothing a visitor should ever see.
      });
  }, [commitSha]);

  // Consent arriving turns the held reports into sent ones, once.
  useEffect(() => {
    allowed.current = Boolean(consent?.analytics);

    if (!ready || !consent?.analytics || held.current.length === 0) return;

    send(held.current, commitSha);
    held.current = [];
  }, [ready, consent?.analytics, commitSha]);

  return null;
}

function send(reports: Report[], commitSha: string | null): void {
  if (reports.length === 0) return;

  const payload = JSON.stringify({ reports, commitSha });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/vitals", new Blob([payload], { type: "application/json" }));
      return;
    }

    void fetch("/api/vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // See the header: never a visitor's problem.
  }
}
