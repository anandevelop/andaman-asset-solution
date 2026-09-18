/**
 * app/[locale]/(site)/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Public-facing chrome. Route groups do not appear in the URL, so every
 * page moved in here keeps its original path (/th, /th/projects, …) while
 * /admin and /login — which sit outside this group — render without the
 * marketing Navbar and Footer.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations, setRequestLocale } from "next-intl/server";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import SalesTeamSection from "@/components/SalesTeamSection";
import SiteCta from "@/components/SiteCta";
import RouteGate from "@/components/RouteGate";
import { getSiteSettings } from "@/lib/settings";
import { getCtaMounts } from "@/lib/site-cta";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function SiteLayout({ children, params }: Props) {
  /*
    Re-asserted here, not just in the parent [locale] layout, because this
    layout makes its own next-intl call (getTranslations below) and so does
    SalesTeamSection further down. next-intl requires setRequestLocale in
    every layout and page of a statically rendered route; without it those
    calls read the locale off the request headers and take the whole route
    dynamic, which a route with `revalidate` set cannot do — it fails with
    DYNAMIC_SERVER_USAGE instead. See the longer note in [locale]/layout.tsx.
  */
  const { locale } = await params;
  setRequestLocale(locale);

  // Navbar is a client component (mobile disclosure, active state), so the
  // live phone number is fetched here and handed down rather than
  // imported. It used to also fetch the published-project list for a
  // "Projects" dropdown; that dropdown was removed from Navbar, so the
  // per-request getPublishedProjects() call went with it — nothing else
  // in this layout needed the list.
  const [settings, t, mounts] = await Promise.all([
    getSiteSettings(),
    getTranslations({ locale, namespace: "nav" }),
    // Which closing-CTA block each page shows. One query for the whole
    // list, cache()d, and an empty table falls back to the copy in
    // messages/*.json rather than to nothing.
    getCtaMounts(),
  ]);

  return (
    <>
      {/*
        Skip link. Seven nav items plus a language switch and a phone CTA
        sit ahead of the content on every page, so a keyboard user had to
        press Tab nine times per page before reaching anything they came
        for.

        Visually hidden until focused rather than display:none — a hidden
        element is not focusable, so `sr-only` alone would make the link
        unreachable by the very people it exists for. It is positioned
        off-screen and snaps into view on :focus.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60
          focus:rounded-xs focus:bg-primary focus:px-5 focus:py-3 focus:text-sm
          focus:font-medium focus:text-white"
      >
        {t("skipToContent")}
      </a>

      {/* print:hidden on this and every other piece of chrome below —
          privacy-policy/terms are currently the only pages that call
          window.print() (see components/PrintButtons.tsx), and before that
          nothing on the site ever triggered print media at all. Without
          this, "Download PDF"/"Print" produced the nav, the sales strip,
          the CTA band and the footer alongside the two paragraphs of legal
          text anyone actually wanted a copy of. */}
      <div className="print:hidden">
        <Navbar
          phone={settings.contact.phone}
          phoneDisplay={settings.contact.phoneDisplay}
          whatsapp={settings.contact.whatsapp}
          logoUrl={settings.branding.logoUrl}
        />
      </div>

      {/* tabIndex={-1} so the skip link can actually move focus here.
          Without it the browser scrolls but focus stays in the header, and
          the next Tab drops the user back at the top of the nav. */}
      <main id="main" tabIndex={-1} className="focus:outline-hidden">
        {children}

        <div className="print:hidden">
          {/* "Our Sales" — mounted once here rather than per-page so it
              appears at the bottom of every public page, not just /about and
              /contact (its original two homes; see the removed imports in
              those page files). It fetches and renders nothing itself when
              there's no active sales team, so it's safe to mount
              unconditionally site-wide. */}
          <SalesTeamSection />

          {/* The closing invitation, below "Our Sales" and immediately above
              the footer. Mounted here rather than on the home page because
              the order is decided here: a section inside `children` can only
              ever land above the sales strip.

              Every editable block is mounted, each behind the routes it was
              assigned at /admin/pages/home/cta, and RouteGate drops all but the one
              this page matches. It has to be done this way round: a layout
              is never told which page it is wrapping, and reading the path
              from headers() to pick a single block server-side would make
              every route dynamic. The gate's check runs during server
              rendering too, so the HTML still contains exactly one band.
              See lib/site-cta.ts. */}
          {mounts.map(({ key, only, except, block, variant }) => (
            <RouteGate key={key} only={only} except={except}>
              <SiteCta block={block} variant={variant} />
            </RouteGate>
          ))}
        </div>
      </main>

      <div className="print:hidden">
        <Footer />
      </div>

      {/*
        Mounted only inside the public site group, not the root layout —
        /admin and /login structurally never load this banner, and since
        Analytics.tsx (root layout) can't gain consent without it, GA/Pixel
        never mount there either. No extra guard needed for that.
      */}
      <div className="print:hidden">
        <CookieConsentBanner />
      </div>
    </>
  );
}
