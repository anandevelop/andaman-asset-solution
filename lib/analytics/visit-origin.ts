/**
 * lib/analytics/visit-origin.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The browser half of traffic sources: what the first page of a visit saw
 * (referring host, utm tags, an ad click id), kept for the rest of the
 * visit so a click three pages later can still say where the visit came
 * from. The server does the classifying (lib/analytics/traffic-source.ts).
 *
 * sessionStorage, like the landing attribution beside it: "this visit" is a
 * tab's lifetime. Nothing here identifies a person — a host name, the tags
 * the link carried, and two yes/no flags.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { VisitOrigin } from "@/lib/analytics/traffic-source";
import type { ClickAction } from "@/lib/analytics/click-actions";

export const ORIGIN_STORAGE_KEY = "andaman.origin";

const tag = (params: URLSearchParams, name: string) => (params.get(name) ?? "").trim().slice(0, 80);

/** What this page load says about where the visit came from. */
export function originFromPage(): VisitOrigin {
  let referrer = "";
  if (document.referrer) {
    try {
      const url = new URL(document.referrer);
      if (url.host !== window.location.host) referrer = url.host;
    } catch {
      // Unparseable: leave it empty.
    }
  }
  const params = new URLSearchParams(window.location.search);
  return {
    referrer,
    utmSource: tag(params, "utm_source"),
    utmMedium: tag(params, "utm_medium"),
    gclid: params.has("gclid") || params.has("gbraid") || params.has("wbraid"),
    fbclid: params.has("fbclid"),
  };
}

/**
 * Record the origin on the first page of a visit. Returns it when this is
 * that first page (so the caller counts the visit), null otherwise.
 */
export function captureOrigin(): VisitOrigin | null {
  try {
    if (window.sessionStorage.getItem(ORIGIN_STORAGE_KEY)) return null;
    const origin = originFromPage();
    window.sessionStorage.setItem(ORIGIN_STORAGE_KEY, JSON.stringify(origin));
    return origin;
  } catch {
    // Storage blocked: count the page as a visit start every time rather
    // than never — one over-count beats a hole in the report.
    return originFromPage();
  }
}

/** The stored origin, or what this page says if nothing is stored. */
export function readOrigin(): VisitOrigin {
  try {
    const raw = window.sessionStorage.getItem(ORIGIN_STORAGE_KEY);
    if (raw) {
      const value = JSON.parse(raw) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 120) : "");
      return {
        referrer: str(value.referrer),
        utmSource: str(value.utmSource),
        utmMedium: str(value.utmMedium),
        gclid: value.gclid === true,
        fbclid: value.fbclid === true,
      };
    }
  } catch {
    // Fall through.
  }
  return originFromPage();
}

/** Count a contact click against this page and this visit's source. */
export function sendClick(action: ClickAction): void {
  try {
    const payload = JSON.stringify({ action, path: window.location.pathname, origin: readOrigin() });
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/click", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // A counter is never worth an error in a reader's console.
  }
}
