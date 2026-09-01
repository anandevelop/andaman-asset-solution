import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Roboto } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { locales, type Locale } from "@/i18n";
import { siteConfig } from "@/config/site";
import { getSiteSettings } from "@/lib/settings";
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

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

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
  const title =
    siteConfig.seo.defaultTitle[resolvedLocale] ?? siteConfig.seo.defaultTitle.en;
  const description =
    siteConfig.description[resolvedLocale] ?? siteConfig.description.en;

  // Admin-editable (lib/settings.ts) — the Search Console "HTML tag"
  // method just wants this one value rendered as
  // <meta name="google-site-verification" content="...">, which Next
  // does for us from here.
  const { analytics } = await getSiteSettings();

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: title,
      template: siteConfig.seo.titleTemplate,
    },
    description,
    keywords: [...siteConfig.seo.keywords],
    alternates: {
      canonical: `${siteConfig.url}/${locale}`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `${siteConfig.url}/${l}`]),
      ),
    },
    openGraph: {
      title,
      description,
      url: `${siteConfig.url}/${locale}`,
      siteName: siteConfig.name,
      images: [
        {
          url: siteConfig.seo.ogImage,
          // Declared so Facebook and LINE can size the preview before the
          // image itself has downloaded.
          width: 1200,
          height: 630,
          alt: siteConfig.name,
        },
      ],
      locale: OG_LOCALE[resolvedLocale] ?? "en_US",
      type: "website",
    },

    /*
      ⚠ These files do not exist yet — see docs/LAUNCH_CHECKLIST.md.
      Declaring the paths now means adding the assets is a drop-in, but
      until they land each one 404s. That is deliberate and tracked;
      shipping a wrong-looking placeholder icon is worse than none.
    */
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
      shortcut: ["/favicon.ico"],
    },

    // app/manifest.ts is served at this path by convention.
    manifest: "/manifest.webmanifest",

    // Stops iOS Safari turning phone numbers in body copy into blue links
    // that fight the design.
    formatDetection: { telephone: false, address: false, email: false },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      site: siteConfig.seo.twitterHandle,
      images: [siteConfig.seo.ogImage],
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

  const [messages, t, settings] = await Promise.all([
    getMessages(),
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
        <Analytics metaPixelId={settings.analytics.metaPixelId || undefined} />
        <Suspense fallback={null}>
          <AnalyticsPageview />
        </Suspense>
      </body>
    </html>
  );
}
