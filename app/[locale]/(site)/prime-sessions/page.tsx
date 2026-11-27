/**
 * app/[locale]/(site)/prime-sessions/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * THE PRIME SESSIONS — the invitation partner agencies are sent a link to.
 * See lib/prime-sessions.ts for the event and how replies are kept.
 *
 * Reachable only through that link: no navbar, footer or closing band
 * (BARE_ROUTES in lib/public-paths.ts), noindex, and listed nowhere — not
 * in the sitemap, the events list or the calendar (its Event row is
 * unpublished). The page reads nothing from the database; every visitor
 * gets the same cached HTML and the countdown is worked out in the browser.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import PrimeInvitation from "@/components/prime-sessions/PrimeInvitation";

type Props = { params: Promise<{ locale: string }> };

// Rendered on first request and cached, like every page under (site) —
// see the note in app/[locale]/layout.tsx on why nothing prerenders.
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "primeSessions" });
  return {
    // absolute: the site's "| Andaman Asset Solution" suffix does not
    // belong on an invitation.
    title: { absolute: t("metaTitle") },
    description: t("metaDescription"),
    robots: { index: false, follow: false, nocache: true },
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      images: [{ url: "/images/prime-sessions/poster.webp", width: 1400, height: 901 }],
    },
  };
}

export default async function PrimeSessionsPage(props: Props) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <PrimeInvitation locale={locale} />;
}
