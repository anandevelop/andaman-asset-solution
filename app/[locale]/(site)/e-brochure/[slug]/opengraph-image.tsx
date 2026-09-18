/**
 * app/[locale]/(site)/e-brochure/[slug]/opengraph-image.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "E-Brochure" (localised, zh excepted — see the news card's own header
 * for why) and the brochure's title, over its cover photo.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { renderOgCard, OG_SIZE } from "@/lib/og-render";
import { getBrochureBySlug, getPublishedBrochureSlugs } from "@/lib/brochures";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/i18n";

export const size = OG_SIZE;
export const contentType = "image/png";

export async function generateStaticParams() {
  const slugs = await getPublishedBrochureSlugs();
  return slugs.map((slug) => ({ slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const brochure = await getBrochureBySlug(slug, locale);

  const eyebrow =
    locale === "zh" ? "E-Brochures" : (await getTranslations({ locale, namespace: "eBrochure" }))("eyebrow");

  return renderOgCard({
    locale: locale as Locale,
    eyebrow,
    title: brochure?.title ?? siteConfig.name,
    backgroundImageUrl: brochure?.coverImageUrl ?? null,
  });
}
