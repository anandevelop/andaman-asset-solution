import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Roboto } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { locales, type Locale } from "@/i18n";
import { siteConfig } from "@/config/site";
import { getSiteSettings } from "@/lib/settings";
import { absoluteAssetUrl, buildIconsMetadata, localizedAlternates } from "@/lib/seo";
import Analytics, { AnalyticsPageview } from "@/components/Analytics";
import "../globals.css";

const roboto = Roboto({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "700", "900"],
  variable: "--font-roboto",
  display: "swap",
});

/**
 * FC Vision (Fontcraft, commercial license purchased — see
 * fonts/fc-vision/LICENSE if a certificate is added). Thai-locale pages
 * only; every other locale keeps Roboto. Weights mirror the Roboto set
 * above so the two are interchangeable via the `font-thai` Tailwind class
 * (tailwind.config.ts) without a layout shift in type scale.
 */
const fcVision = localFont({
  src: [
    { path: "../../fonts/fc-vision/FCVision-Light.ttf", weight: "300", style: "normal" },
    { path: "../../fonts/fc-vision/FCVision-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../fonts/fc-vision/FCVision-Medium.ttf", weight: "500", style: "normal" },
    { path: "../../fonts/fc-vision/FCVision-Bold.ttf", weight: "700", style: "normal" },
    { path: "../../fonts/fc-vision/FCVision-Black.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-fc-vision",
  display: "swap",
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/** og:locale wants underscore-joined IETF tags, not our bare locale codes. */
const OG_LOCALE: Record<Locale, string> = {
  en: "en_US",
  th: "th_TH",
  zh: "zh_CN",
  ru: "ru_RU",
};

/*
  No generateStaticParams() here, on purpose — and the public pages under
  (site)/ that read the database return an empty list from theirs, rather
  than the locales or the published slugs.

  The Docker build has no Postgres (see the DATABASE_URL placeholder in the
  Dockerfile's builder stage), so anything prerendered at build time bakes
  the safeQuery fallback into the image: every deploy shipped the "database
  offline" homepage, and it stayed that way until `revalidate` expired,
  because the cache a `revalidatePath` from /admin had cleared lived in the
  container the deploy replaced.

  A layout's params flow down to every page beneath it, so a list here would
  prerender every route under it. The layout stays without one and each
  page says `[]` for itself.

  `[]` and "no function" are not the same thing, and the second is the
  mistake to avoid. A route with no generateStaticParams anywhere is not
  registered for ISR: it is served `Cache-Control: no-store`, a database
  round trip per visitor, and its `revalidate` does nothing. Returning `[]`
  registers it with no paths, so it renders once on its first request
  against the live database and is cached from there — measured on a built
  server as MISS then HIT with the page's own s-maxage.

  /projects and /news have no function at all, deliberately: they read
  `searchParams`, and a route registered for ISR that reads it fails with
  DYNAMIC_SERVER_USAGE (a layout-level `[]` did exactly that to both). Left
  alone they stay dynamic, as they were when they were prerendered.
*/

/**
 * Viewport is its own export in the App Router — putting these keys in
 * `metadata` is silently ignored since Next 14.
 *
 * `maximumScale` is deliberately absent. Capping zoom is a WCAG 1.4.4
 * failure, and the usual reason for it — iOS zooming on focused inputs —
 * is already handled by the 16px minimum font size on form fields.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Paints the Safari/Android browser chrome in the brand navy.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#083551" },
    { media: "(prefers-color-scheme: dark)", color: "#041d2c" },
  ],
  colorScheme: "light",
};

export async function generateMetadata(
  props: {
    params: Promise<{ locale: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;

  const {
    locale
  } = params;

  // Every locale in i18n.ts has a real key on both objects (see
  // config/site.ts) — the `?? .en` is just defensive against a future
  // locale being added to i18n.ts before its copy is written.
  const resolvedLocale = locale as Locale;

  /*
    Admin-editable (lib/settings.ts), with config/site.ts behind every
    field: a cleared row resolves back to the committed default, so this
    renders exactly what it used to until someone changes something.

    The homepage has its own generateMetadata that sets the same title and
    description — see app/[locale]/(site)/page.tsx. Both read from here;
    changing one without the other is how the most important page on the
    site ends up ignoring the setting.
  */
  const { analytics, branding, seo } = await getSiteSettings();

  const title = seo.metaTitle[resolvedLocale] ?? seo.metaTitle.en;
  const description = seo.metaDescription[resolvedLocale] ?? seo.metaDescription.en;

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: title,
      template: seo.titleTemplate,
    },
    description,
    keywords: [...siteConfig.seo.keywords],
    alternates: localizedAlternates(locale, ""),
    openGraph: {
      title,
      description,
      url: `${siteConfig.url}/${locale}`,
      siteName: siteConfig.name,
      images: [
        {
          url: absoluteAssetUrl(branding.ogImageUrl),
          // Declared so Facebook and LINE can size the preview before the
          // image itself has downloaded. Both numbers describe the
          // committed card; an upload of another shape will preview at its
          // own dimensions once fetched.
          width: 1200,
          height: 630,
          alt: siteConfig.name,
        },
      ],
      locale: OG_LOCALE[resolvedLocale] ?? "en_US",
      type: "website",
    },

    /*
      The committed set from config/site.ts until an admin uploads a mark,
      and then exactly one icon link — see buildIconsMetadata() in
      lib/seo.ts for why a second one would make the upload look broken.
    */
    icons: buildIconsMetadata(branding.faviconUrl),

    // app/manifest.ts is served at this path by convention.
    manifest: "/manifest.webmanifest",

    // Stops iOS Safari turning phone numbers in body copy into blue links
    // that fight the design.
    formatDetection: { telephone: false, address: false, email: false },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      site: seo.twitterHandle,
      images: [absoluteAssetUrl(branding.ogImageUrl)],
    },
    robots: {
      index: true,
      follow: true,
    },
    // undefined (not "") when unset — Next omits the meta tag entirely
    // rather than rendering content="".
    verification: analytics.googleSiteVerification
      ? { google: analytics.googleSiteVerification }
      : undefined,
  };
}

export default async function LocaleLayout(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  const {
    children
  } = props;

  if (!locales.includes(locale as (typeof locales)[number])) notFound();

  /*
    Opts this whole subtree into static rendering.

    Without it, the first next-intl call in a Server Component — getMessages()
    two lines down — falls back to reading the locale off the request headers,
    which is a dynamic API. On a route with `revalidate` set that is not a
    warning, it is a hard DYNAMIC_SERVER_USAGE failure the moment the page has
    to be generated on demand rather than served from the cache.

    Nothing under here is prerendered at build time any more (see the note
    above `viewport`), so every public route is generated on demand on its
    first request — this call is what makes that
    work for all of them, not just the slug pages. Those were the first to
    show it: the Docker build has no database, so generateStaticParams()
    returned nothing for them and every project detail page 500'd, while
    pages prerendered at build time hid the same mistake — they were served
    from disk and their failing background revalidation was silent.

    Must run before any other next-intl call, and in every layout and page of
    a statically rendered route. See next-intl's static-rendering docs.
  */
  setRequestLocale(locale);

  const [messages, t, settings] = await Promise.all([
    getMessages({ locale }),
    getTranslations({ locale }),
    getSiteSettings(),
  ]);

  const isThai = locale === "th";

  return (
    <html lang={locale} className={`${roboto.variable} ${fcVision.variable}`}>
      <body
        className={`min-h-screen bg-surface ${isThai ? "font-thai" : "font-sans"} text-ink antialiased`}
      >
        {/*
          This layout is the shell only — html/font/i18n provider. Public
          chrome (Navbar/Footer) lives in (site)/layout.tsx so that /admin and
          /login can render their own chrome without inheriting it.
        */}
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>

        {/*
          Analytics last, and Suspense-wrapped: AnalyticsPageview reads
          useSearchParams(), which would otherwise force every static page
          into dynamic rendering.
        */}
        {/*
          Both IDs come from settings now. GA4 used to be env-only, which
          meant switching it on required rebuilding the image — and per
          docs/LAUNCH_CHECKLIST.md that is why it was not running in
          production at all. NEXT_PUBLIC_GA_ID is still the deploy-time
          default behind the setting (see defaultSettings()).
        */}
        <Analytics
          gaId={settings.analytics.gaMeasurementId || undefined}
          metaPixelId={settings.analytics.metaPixelId || undefined}
        />
        <Suspense fallback={null}>
          <AnalyticsPageview />
        </Suspense>
      </body>
    </html>
  );
}
