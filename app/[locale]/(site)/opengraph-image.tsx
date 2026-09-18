/**
 * app/[locale]/(site)/opengraph-image.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The homepage's card. File-convention images take priority over the root
 * layout's own `openGraph.images` for this exact segment (see
 * app/[locale]/layout.tsx's generateMetadata) — every other page still
 * gets that static default; only `/` gets this generated one.
 *
 * Fixed content on purpose, not the admin-editable SEO meta title: that
 * field is genuinely free text an admin could write in real Chinese or
 * Russian for search purposes, and lib/og-render.tsx has no CJK coverage
 * to render it with — see that file's header. The brand name and a fixed
 * English kicker are what public/og-image.jpg already showed for every
 * locale before this file existed, so this is the same content, generated
 * instead of a committed JPEG.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { renderOgCard, OG_SIZE } from "@/lib/og-render";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/i18n";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = siteConfig.name;

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return renderOgCard({
    locale: locale as Locale,
    eyebrow: "Luxury Pool Villas · Phuket",
    title: siteConfig.name,
  });
}
