"use client";

/**
 * components/Analytics.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * GA4 and Meta Pixel script injection, plus SPA pageview tracking.
 *
 * Renders nothing at all when neither ID is configured — no script tags, no
 * network requests, no cookie banner obligation in development.
 *
 * `metaPixelId` is a prop, not read from lib/analytics.ts directly: the
 * admin Settings page (lib/settings.ts) can override
 * NEXT_PUBLIC_META_PIXEL_ID, and that only resolves at request time via
 * getSiteSettings(). app/[locale]/layout.tsx fetches it and passes it down.
 * GA stays env-only — `gaId` defaults to GA_ID for the same call shape.
 *
 * Consent-gated on top of that (lib/cookie-consent.ts, banner in
 * components/CookieConsentBanner.tsx): GA4 only mounts once
 * `consent.analytics` is true, the Pixel only once `consent.marketing` is
 * true, and the default before any decision is "neither" — opt-in, not
 * opt-out, so a script tag existing at all already implies consent was
 * given. The `gtag('consent', 'default', ...)` call below documents intent
 * but no longer does the gating itself; the script it lives in doesn't run
 * pre-consent at all.
 *
 * Both are `afterInteractive`: analytics must never compete with the hero
 * image for bandwidth on a 4G connection, and neither is needed before the
 * page is usable.
 *
 * GA4 is configured with `anonymize_ip` and denied ad-personalisation
 * storage regardless of the visitor's analytics choice. Under PDPA,
 * measurement of our own site is defensible as legitimate interest once
 * consented to; building advertising profiles through GA is not, absent a
 * separate consent this site does not collect.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GA_ID, META_PIXEL_ID, trackPageview } from "@/lib/analytics";
import { useCookieConsent } from "@/lib/cookie-consent";

/**
 * Fires a pageview on every client-side navigation.
 *
 * Split out and Suspense-wrapped by the caller because useSearchParams()
 * opts the whole subtree into dynamic rendering — without the boundary,
 * every static marketing page would become server-rendered per request.
 */
export function AnalyticsPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // The GA snippet already sends a pageview on load; sending another
    // here would double-count every entry page.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const query = searchParams.toString();
    // trackPageview() itself checks whether a script actually loaded — no
    // need to know here whether the ID came from env or the admin
    // Settings page.
    trackPageview(query ? `${pathname}?${query}` : pathname, document.title);
  }, [pathname, searchParams]);

  return null;
}

type Props = {
  /** Falls back to the env default when the caller doesn't resolve one. */
  gaId?: string;
  metaPixelId?: string;
};

export default function Analytics({ gaId = GA_ID, metaPixelId = META_PIXEL_ID }: Props) {
  const { consent } = useCookieConsent();
  const analyticsAllowed = Boolean(consent?.analytics);
  const marketingAllowed = Boolean(consent?.marketing);

  if ((!gaId || !analyticsAllowed) && (!metaPixelId || !marketingAllowed)) return null;

  return (
    <>
      {/* ── GA4 ──────────────────────────────────────────────────────── */}
      {gaId && analyticsAllowed && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('consent', 'default', {
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                analytics_storage: 'granted'
              });
              gtag('config', '${gaId}', { anonymize_ip: true });
            `}
          </Script>
        </>
      )}

      {/* ── Meta Pixel ───────────────────────────────────────────────── */}
      {metaPixelId && marketingAllowed && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window,document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${metaPixelId}');
              fbq('track', 'PageView');
            `}
          </Script>

          {/* Fallback for visitors with JavaScript disabled. */}
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}
    </>
  );
}
