/**
 * lib/analytics.ts
 * ─────────────────────────────────────────────────────────────────────────
 * GA4 and Meta Pixel event tracking.
 *
 * Everything here is a no-op when neither script has loaded, which is the
 * point: local development and CI produce no tracking requests at all, and
 * a page does not need to know whether analytics is switched on.
 *
 * `track()`/`trackPageview()` gate on `window.gtag`/`window.fbq` actually
 * existing, not on a build-time env constant. The Meta Pixel ID in
 * particular can come from the admin Settings page (see lib/settings.ts)
 * rather than NEXT_PUBLIC_META_PIXEL_ID, so it is only known at request
 * time — checking for the initialised script is correct either way, and
 * doesn't need this module to know where the ID came from.
 *
 * Events are named once, here, rather than typed as strings at each call
 * site. GA4 reporting is only as good as the consistency of the event
 * names, and "lead_submit" vs "submit_lead" in two components is a data
 * problem nobody catches until the quarterly report looks wrong.
 *
 * No personal data is ever sent. Names, emails and phone numbers stay in
 * Postgres — passing them to an ad network would be a PDPA problem, and the
 * consent the visitor gave covers our contacting them, not remarketing.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Build-time default — components/Analytics.tsx prefers the admin
 *  Settings value when one is saved (see app/[locale]/layout.tsx). */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

declare global {
  interface Window {
    gtag?: (
      command: "config" | "event" | "js" | "consent",
      targetOrName: string | Date,
      params?: Record<string, unknown>,
    ) => void;
    dataLayer?: unknown[];
    fbq?: {
      (command: "init" | "track" | "trackCustom", name: string, params?: object): void;
      queue?: unknown[];
      loaded?: boolean;
    };
  }
}

/** The complete set of custom events. Add here, not at the call site. */
export type AnalyticsEvent =
  | "lead_submit"
  | "event_rsvp"
  | "project_view"
  | "article_read"
  | "line_click"
  | "whatsapp_click"
  | "phone_click";

/** Meta's standard events, which power its optimisation. Custom names do
 *  not, so the meaningful conversions are mapped onto them. */
const META_STANDARD: Partial<Record<AnalyticsEvent, string>> = {
  lead_submit: "Lead",
  event_rsvp: "Schedule",
  project_view: "ViewContent",
};

function canTrack(): boolean {
  return (
    typeof window !== "undefined" &&
    (typeof window.gtag === "function" || typeof window.fbq === "function")
  );
}

/** Send one event to whichever providers are configured. */
export function track(
  name: AnalyticsEvent,
  params: Record<string, string | number | boolean | undefined> = {},
): void {
  if (!canTrack()) return;

  // Drop undefined members — GA4 records the literal string "undefined".
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );

  try {
    if (window.gtag) {
      window.gtag("event", name, clean);
    }

    if (window.fbq) {
      const standard = META_STANDARD[name];
      if (standard) window.fbq("track", standard, clean);
      else window.fbq("trackCustom", name, clean);
    }
  } catch (error) {
    // Analytics must never break a form submission.
    console.warn("[analytics] failed to send event", name, error);
  }
}

/**
 * Manual pageview. GA4's enhanced measurement does not fire on App Router
 * client-side navigations, so <AnalyticsPageview /> calls this on every
 * route change.
 */
export function trackPageview(url: string, title?: string): void {
  if (!canTrack()) return;

  try {
    // GA stays env-only (unlike the Meta Pixel ID, it is not admin-
    // editable), so gating on the same GA_ID the init script used is
    // still correct here.
    if (window.gtag && GA_ID) {
      window.gtag("config", GA_ID, {
        page_path: url,
        page_title: title,
        // Suppress the automatic pageview so it is not double-counted.
        send_page_view: true,
      });
    }

    if (window.fbq) {
      window.fbq("track", "PageView");
    }
  } catch (error) {
    console.warn("[analytics] failed to send pageview", error);
  }
}

// ── Named helpers, so call sites stay readable ──────────────────────────

export function trackLead(params: { source?: string; projectSlug?: string }): void {
  track("lead_submit", {
    source: params.source,
    project: params.projectSlug,
    // GA4 conversion value. A viewing request is not a sale, but a nonzero
    // value lets Ads optimise toward it.
    value: 1,
    currency: "THB",
  });
}

export function trackRsvp(params: { eventId: string; partySize: number }): void {
  track("event_rsvp", {
    event_id: params.eventId,
    party_size: params.partySize,
    value: params.partySize,
    currency: "THB",
  });
}

export function trackProjectView(params: { slug: string; name: string }): void {
  track("project_view", { content_ids: params.slug, content_name: params.name });
}

export function trackLineClick(location: string): void {
  track("line_click", { location });
}

export function trackWhatsAppClick(location: string): void {
  track("whatsapp_click", { location });
}

export function trackPhoneClick(location: string): void {
  track("phone_click", { location });
}
