/**
 * lib/home-content.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Home page sections that moved from hardcoded constants to the database:
 * the "Who we are" photo strip (components/CompanyIntro.tsx), the
 * Corporate services tile grid (components/Corporate.tsx), and the
 * "Why us" 4-card section (app/[locale]/(site)/page.tsx). See
 * lib/mission-principles.ts for the About page's structurally-identical
 * "Why us" counterpart — kept in its own file since it belongs to a
 * different page, the same way lib/awards.ts and lib/milestones.ts stay
 * separate despite a similar read shape.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { getTranslation } from "@/lib/get-translation";
import type { SectionIcon } from "@prisma/client";

export type HomeGalleryPhoto = {
  id: string;
  imageUrl: string;
  label: string;
};

/** Active photos, curated order — drives CompanyIntro's gallery strip. */
export async function getHomeGalleryPhotos(): Promise<HomeGalleryPhoto[]> {
  return safeQuery(
    "homeGalleryPhoto.findMany(active)",
    () =>
      prisma.homeGalleryPhoto.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, imageUrl: true, label: true },
      }),
    [] as HomeGalleryPhoto[],
  );
}

export type CorporateService = {
  id: string;
  imageUrl: string;
  label: string;
  imageAlt: string;
};

const CORPORATE_SERVICE_SELECT = {
  id: true,
  imageUrl: true,
  translations: true,
} as const;

type CorporateServiceRow = {
  id: string;
  imageUrl: string;
  translations: { locale: string; label: string; imageAlt: string }[];
};

/** Active services, curated order — drives Corporate's 2×2 tile grid. */
export async function getCorporateServices(locale: string): Promise<CorporateService[]> {
  const rows: CorporateServiceRow[] = await safeQuery(
    "corporateService.findMany(active)",
    () =>
      prisma.corporateService.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: CORPORATE_SERVICE_SELECT,
      }),
    [] as CorporateServiceRow[],
  );

  return rows.map((row) => {
    // getTranslation() already falls back to "en" then "th" on its own —
    // no deprecated column pair to reach for here, this model was born
    // after the 4-locale pattern, same as HeroStorySlide. Only reachable
    // if a row somehow has zero translations at all.
    const t = getTranslation(row.translations, locale);

    return {
      id: row.id,
      imageUrl: row.imageUrl,
      label: t?.label ?? "",
      imageAlt: t?.imageAlt ?? "",
    };
  });
}

export type WhyUsPoint = {
  id: string;
  icon: SectionIcon;
  title: string;
  body: string;
};

const WHY_US_POINT_SELECT = {
  id: true,
  icon: true,
  translations: true,
} as const;

type WhyUsPointRow = {
  id: string;
  icon: SectionIcon;
  translations: { locale: string; title: string; body: string }[];
};

/** Active points, curated order — drives the home page's "Why us" cards. */
export async function getWhyUsPoints(locale: string): Promise<WhyUsPoint[]> {
  const rows: WhyUsPointRow[] = await safeQuery(
    "whyUsPoint.findMany(active)",
    () =>
      prisma.whyUsPoint.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: WHY_US_POINT_SELECT,
      }),
    [] as WhyUsPointRow[],
  );

  return rows.map((row) => {
    const t = getTranslation(row.translations, locale);

    return {
      id: row.id,
      icon: row.icon,
      title: t?.title ?? "",
      body: t?.body ?? "",
    };
  });
}
