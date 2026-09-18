/**
 * lib/company.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only data access for the CompanyProfile singleton — "About
 * Andaman Asset Solution" copy shared by /about and, potentially, any
 * project page that wants a company blurb. See the model comment in
 * schema.prisma for why this is one row rather than per-project text.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { pickLocale } from "@/lib/locale";
import { getTranslation } from "@/lib/get-translation";

export type CompanyProfileSummary = {
  aboutUsEn: string;
  aboutUsTh: string | null;
  /** Locale-resolved — tries CompanyProfileTranslation first (via
   *  getTranslation()), then falls back to the deprecated aboutUsEn/Th
   *  pair, same pattern as every other model in lib/projects.ts. */
  aboutUs: string;
  /** About page Story section eyebrow/heading. Null — not "" — when the
   *  current locale's translation row doesn't have one yet (the column
   *  defaults to "" at the database level so an ADD COLUMN on the one
   *  existing row could never fail; this is where that sentinel gets
   *  turned into the "nothing here yet" every caller already expects),
   *  so the page's own `?? t("story.eyebrow")` fallback keeps working
   *  exactly as it does for aboutUs. */
  storyEyebrow: string | null;
  storyTitle: string | null;
  /** Not locale-resolved — one photo for every language. */
  storyImageUrl: string;
  /** The About page header's full-bleed hero photo. Not locale-resolved,
   *  same reasoning as storyImageUrl. */
  aboutHeroImageUrl: string;
  /** The four Vision & Mission figures on the home page. Not
   *  locale-resolved — see CompanyProfile's schema.prisma comment for
   *  why these stay the same glyphs in every language. */
  /** Null until an administrator sets it — see CompanyProfile in
   *  schema.prisma and lib/company-stats.ts. */
  foundedYear: number | null;
};

/**
 * The singleton row (`id: "default"`), or null if it hasn't been seeded
 * yet. Callers should fall back to existing static copy rather than
 * rendering nothing — see app/[locale]/about/page.tsx.
 */
export const getCompanyProfile = cache(
  async (locale: string): Promise<CompanyProfileSummary | null> => {
    const db = prisma;

    const profile = await safeQuery<any>(
      "companyProfile.findUnique(default)",
      () =>
        db.companyProfile.findUnique({
          where: { id: "default" },
          include: { translations: true },
        }),
      null,
    );

    if (!profile) return null;

    const t = getTranslation<any>(profile.translations, locale);

    return {
      aboutUsEn: profile.aboutUsEn,
      aboutUsTh: profile.aboutUsTh,
      aboutUs: t?.aboutUs ?? pickLocale(locale, profile.aboutUsTh, profile.aboutUsEn),
      storyEyebrow: t?.storyEyebrow || null,
      storyTitle: t?.storyTitle || null,
      storyImageUrl: profile.storyImageUrl,
      aboutHeroImageUrl: profile.aboutHeroImageUrl,
      foundedYear: profile.foundedYear,
    };
  },
);
