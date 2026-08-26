/**
 * lib/awards.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Awards — the "Awards" section on the home page (and the awards *count*
 * on project pages — see the mini-stats row in
 * app/[locale]/(site)/projects/[slug]/page.tsx, which only reads
 * `.length`).
 *
 * `title` is resolved server-side here via getTranslation(), same pattern
 * as lib/projects.ts — this used to return titleEn/titleTh raw and let
 * components/AwardsSection.tsx pick the language itself via next-intl, but
 * that only ever worked for th/en; resolving it here once, with the same
 * fallback chain every other model uses, is what makes zh/ru work without
 * teaching every consumer about AwardTranslation.
 *
 * sandbox: `prisma as any` — Award and AwardTranslation were added to
 * schema.prisma in earlier phases; see the cast note above getProjectBySlug
 * in lib/projects.ts for why the locally generated client doesn't type
 * them yet.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { pickLocale } from "@/lib/locale";
import { getTranslation } from "@/lib/get-translation";

export type Award = {
  id: string;
  title: string;
  organization: string;
  projectName: string | null;
  year: number;
  trophyImageUrl: string | null;
};

const SELECT = {
  id: true,
  titleEn: true,
  titleTh: true,
  organization: true,
  projectName: true,
  year: true,
  trophyImageUrl: true,
  translations: true,
} as const;

type Row = {
  id: string;
  titleEn: string;
  titleTh: string;
  organization: string;
  projectName: string | null;
  year: number;
  trophyImageUrl: string | null;
  translations: { locale: string; title: string }[];
};

/** Active awards, curated order — drives the home page Awards section. */
export async function getAwards(locale: string): Promise<Award[]> {
  const db = prisma as any;

  const rows: Row[] = await safeQuery(
    "award.findMany(active)",
    () =>
      db.award.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: SELECT,
      }),
    [] as Row[],
  );

  return rows.map((row) => {
    const t = getTranslation(row.translations, locale);

    return {
      id: row.id,
      title: t?.title ?? pickLocale(locale, row.titleTh, row.titleEn),
      organization: row.organization,
      projectName: row.projectName,
      year: row.year,
      trophyImageUrl: row.trophyImageUrl,
    };
  });
}
