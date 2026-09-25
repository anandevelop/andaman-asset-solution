"use client";

/**
 * components/PageViewBeacon.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Tells the server that this page is being read, and keeps telling it.
 * Renders nothing.
 *
 * Three jobs, all from one mount because they all need the same moment:
 *
 *  1. Count the read. One beacon per path, guarded against React's
 *     development double-mount so a local read does not count twice.
 *  2. Keep the visit alive. A heartbeat every 15 seconds carrying how long
 *     this page has been open, which is what /admin/analytics's realtime
 *     tab reads. The server sees requests; only the browser can measure
 *     attention, and only it knows the tab was hidden.
 *  3. Remember where this visit began — the landing path and the referring
 *     host — in sessionStorage, for LeadForm to send with an enquiry.
 *
 * WHY (3) IS HERE AND NOT IN THE FORM
 *
 * The form is on /contact. By the time it renders, document.referrer is
 * whatever page linked to it inside this site, and the fact that somebody
 * arrived from Google on an article two clicks ago is gone. It has to be
 * recorded on the first page of the visit or not at all, which is also why
 * it ships now rather than with the reporting that uses it: this data
 * cannot be backfilled, and every week it is not collected is a week
 * missing from the first report.
 *
 * Uses sendBeacon where it exists: it survives the page being closed, which
 * a fetch started on the way out does not, and it never delays the
 * navigation. fetch with keepalive is the fallback.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { LANDING_STORAGE_KEY, type LandingAttribution } from "@/lib/analytics/landing";

/** Matches LIVE_VISIT_TTL_MS/60 in lib/analytics/live-visit.ts: four
 *  heartbeats have to fit inside the window a visit is considered live
 *  for, or a reader sitting still would be swept while still reading. */
const HEARTBEAT_MS = 15_000;

function send(body: Record<string, unknown>): void {
  const payload = JSON.stringify(body);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/page-view", new Blob([payload], { type: "application/json" }));
      return;
    }

    void fetch("/api/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // A counter is never worth an error in a reader's console.
  }
}

/**
 * Record where this visit started, once.
 *
 * sessionStorage, not localStorage: "this visit" is exactly a tab's
 * lifetime, and a landing page remembered from last week would attribute
 * today's enquiry to it. Written only if absent, so the second page of a
 * visit does not overwrite the first.
 *
 * The referrer is reduced to its host here rather than server-side. A full
 * referring URL is a record of what somebody was reading elsewhere, and the
 * question this answers — search, social, or direct — needs only the host.
 */
function captureLanding(path: string): void {
  try {
    if (window.sessionStorage.getItem(LANDING_STORAGE_KEY)) return;

    let referrer = "";
    if (document.referrer) {
      try {
        const url = new URL(document.referrer);
        // Somewhere else on this site is not a referrer worth recording:
        // it would make every visit look internal.
        if (url.host !== window.location.host) referrer = url.host;
      } catch {
        // Not a URL we can parse. Leaving it empty is the honest answer.
      }
    }

    const landing: LandingAttribution = { path, referrer };
    window.sessionStorage.setItem(LANDING_STORAGE_KEY, JSON.stringify(landing));
  } catch {
    // Private mode, or storage disabled. Attribution is a nice-to-have and
    // is never worth interrupting somebody's visit.
  }
}

export default function PageViewBeacon() {
  const pathname = usePathname();
  const counted = useRef<string | null>(null);

  useEffect(() => {
    if (counted.current === pathname) return;
    counted.current = pathname;

    captureLanding(pathname);
    send({ path: pathname });
  }, [pathname]);

  // The heartbeat is its own effect, keyed on the path, so arriving at a
  // new page restarts the clock — dwellMs is time on *this* page, which is
  // what the realtime tab reports and what the first effect above cannot
  // know because it fires once and is done.
  useEffect(() => {
    const startedAt = Date.now();

    const timer = setInterval(() => {
      // A hidden tab is not a reader. Skipping the beat rather than
      // stopping the timer means a tab brought back to the front resumes
      // without remounting — and a visit left hidden for fifteen minutes
      // ages out of the live table by itself, which is correct.
      if (document.visibilityState !== "visible") return;

      send({ path: pathname, dwellMs: Date.now() - startedAt, heartbeat: true });
    }, HEARTBEAT_MS);

    return () => clearInterval(timer);
  }, [pathname]);

  return null;
}
