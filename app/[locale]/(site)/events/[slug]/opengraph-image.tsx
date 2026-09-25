/**
 * app/[locale]/(site)/events/[slug]/opengraph-image.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Date and event name, over the cover photo.
 *
 * The date is formatted "th-TH" for the Thai card and "en-US" for every
 * other locale — never intlLocale(locale)'s usual per-locale mapping,
 * which for zh would print Chinese month characters lib/og-render.tsx has
 * no font to draw (see that file's header). en-US covers en, ru and zh
 * alike with plain Latin digits and month names.
 *
 * Event.ogImageUrl — the event editor's manual override — passes straight
 * through instead of being redrawn; see lib/og-render.tsx's
 * passThroughImage and the Project route's own opengraph-image.tsx for the
 * same pattern.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { renderOgCard, passThroughImage, OG_SIZE } from "@/lib/og-render";
import { getEventBySlug } from "@/lib/events";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/i18n";

export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const event = await getEventBySlug(slug, locale);

  if (event?.ogImageUrl) {
    return passThroughImage(event.ogImageUrl);
  }

  const dateLabel = event
    ? new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(event.startsAt)
    : undefined;

  return renderOgCard({
    locale: locale as Locale,
    eyebrow: dateLabel,
    title: event?.title ?? siteConfig.name,
    backgroundImageUrl: event?.coverImageUrl ?? null,
  });
}
