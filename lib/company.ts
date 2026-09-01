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
    };
  },
);
