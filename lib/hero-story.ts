/**
 * lib/hero-story.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The homepage's hero carousel (see components/HeroCarousel.tsx and
 * HeroStorySlide in schema.prisma).
 *
 * Same shape as lib/faqs.ts: a server-only query that resolves each row's
 * Translation-table caption/CTA label for the requesting locale and hands
 * the client component a plain, already-localized array — HeroCarousel
 * itself never touches Prisma or next-intl's server APIs, since it has to
 * be a Client Component for the arrow-button/hover-pause interactivity.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { getTranslation } from "@/lib/get-translation";

export type HeroStoryMediaType = "IMAGE" | "VIDEO";

export type HeroStorySlide = {
  id: string;
  mediaType: HeroStoryMediaType;
  mediaUrl: string;
  /** Video-only loading thumbnail — null for IMAGE slides. */
  posterImageUrl: string | null;
  /** IMAGE slides only; VIDEO slides advance on the file's own `onEnded`. */
  durationSeconds: number;
  /** Not translated — a URL doesn't have a language. */
  ctaUrl: string | null;
  /** Optional per-locale overlay text — a pure mood shot may have none. */
  caption: string | null;
  /** Short line under the headline — same role as Project.tagline. */
  tagline: string | null;
  ctaLabel: string | null;
};

// Not `satisfies Prisma.HeroStorySlideSelect` — HeroStorySlide is new this
// phase and isn't in the locally generated client's types; see the cast
// note above getProjectBySlug in lib/projects.ts for why.
const SELECT = {
  id: true,
  mediaType: true,
  mediaUrl: true,
  posterImageUrl: true,
  durationSeconds: true,
  ctaUrl: true,
  translations: true,
} as const;

type Row = any;

function toSlide(row: Row, locale: string): HeroStorySlide {
  const t = getTranslation<any>(row.translations, locale);

  return {
    id: row.id,
    mediaType: row.mediaType,
    mediaUrl: row.mediaUrl,
    posterImageUrl: row.posterImageUrl,
    durationSeconds: row.durationSeconds,
    ctaUrl: row.ctaUrl,
    caption: t?.caption ?? null,
    tagline: t?.tagline ?? null,
    ctaLabel: t?.ctaLabel ?? null,
  };
}

/**
 * Active slides in display order. Returns an empty array — never throws —
 * whenever the database is offline or the table is empty, so the homepage
 * can fall back to a plain static hero instead of breaking (see
 * components/HeroCarousel.tsx's `fallback` prop).
 */
export async function getHeroStorySlides(locale: string): Promise<HeroStorySlide[]> {
  const rows = await safeQuery(
    "heroStorySlide.findMany(active)",
    () =>
      (prisma as any).heroStorySlide.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: SELECT,
      }),
    [] as Row[],
  );

  return rows.map((row: Row) => toSlide(row, locale));
}
