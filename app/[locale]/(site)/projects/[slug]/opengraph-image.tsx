/**
 * app/[locale]/(site)/projects/[slug]/opengraph-image.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Name and location, over the hero photo — no price. The public site
 * dropped prices everywhere else on the business's own decision (see
 * components/FeaturedProjectCard.tsx's header: "the business no longer
 * wants prices shown to visitors"); a card built to be forwarded on
 * WhatsApp and cached by Facebook indefinitely is the last place to bring
 * the number back.
 *
 * Project.ogImageUrl — the SEO tab's manual override — passes straight
 * through instead of being redrawn; see lib/og-render.tsx's
 * passThroughImage. Everything else here reuses getProjectBySlug()
 * unchanged, the same data the page itself renders from.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { renderOgCard, passThroughImage, OG_SIZE } from "@/lib/og-render";
import { getProjectBySlug } from "@/lib/projects";
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
  const project = await getProjectBySlug(slug, locale);

  if (project?.ogImageUrl) {
    return passThroughImage(project.ogImageUrl);
  }

  return renderOgCard({
    locale: locale as Locale,
    eyebrow: project?.location,
    title: project?.name ?? siteConfig.name,
    backgroundImageUrl: project?.heroImageUrl ?? null,
  });
}
