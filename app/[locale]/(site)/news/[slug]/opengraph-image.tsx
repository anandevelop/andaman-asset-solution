/**
 * app/[locale]/(site)/news/[slug]/opengraph-image.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Category and headline, over the cover photo.
 *
 * `category` is a free-text field an editor types once (schema.prisma's
 * own example values are English — "Market Insight", "Company News",
 * "Guides"), not a per-locale translation, so it is shown as written when
 * present. Its fallback, and every other locale's version of the same
 * word, is real i18n (the public site's own nav.news: "ข่าวสาร",
 * "Новости", …) except on zh, which falls back to the English word
 * instead — lib/og-render.tsx has no CJK glyphs to draw "新闻" with; see
 * that file's header for why closing that gap is out of scope here.
 *
 * NewsArticle.ogImageUrl — the article editor's manual override — passes
 * straight through instead of being redrawn; see lib/og-render.tsx's
 * passThroughImage and the Project route's own opengraph-image.tsx for the
 * same pattern.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { renderOgCard, passThroughImage, OG_SIZE } from "@/lib/og-render";
import { getArticleBySlug, getPublishedArticleSlugs } from "@/lib/news";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/i18n";

export const size = OG_SIZE;
export const contentType = "image/png";

export async function generateStaticParams() {
  const slugs = await getPublishedArticleSlugs();
  return slugs.map((slug) => ({ slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const article = await getArticleBySlug(slug, locale);

  if (article?.ogImageUrl) {
    return passThroughImage(article.ogImageUrl);
  }

  const newsLabel =
    locale === "zh" ? "News" : (await getTranslations({ locale, namespace: "nav" }))("news");

  return renderOgCard({
    locale: locale as Locale,
    eyebrow: article?.category ?? newsLabel,
    title: article?.title ?? siteConfig.name,
    backgroundImageUrl: article?.coverImageUrl ?? null,
  });
}
