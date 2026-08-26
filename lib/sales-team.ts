/**
 * lib/sales-team.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "Our Sales" — shown only on /about and /contact
 * (app/[locale]/(site)/about/page.tsx, .../contact/page.tsx).
 *
 * `name`/`position` are resolved server-side here via getTranslation(),
 * same pattern as lib/projects.ts and lib/awards.ts — this used to return
 * nameEn/Th and positionEn/Th raw and let components/SalesTeamSection.tsx
 * pick the language itself, but a fixed th/en pickLocale() can't express
 * zh/ru, so the resolution moved down into this fetcher (the one place
 * that knows about SalesPersonTranslation) instead of teaching the
 * component about it too.
 *
 * sandbox: `prisma as any` — SalesPerson and SalesPersonTranslation were
 * added to schema.prisma in earlier phases; see the cast note above
 * getProjectBySlug in lib/projects.ts for why the locally generated client
 * doesn't type them yet.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { pickLocale } from "@/lib/locale";
import { getTranslation } from "@/lib/get-translation";

export type SalesPerson = {
  id: string;
  name: string;
  position: string;
  whatsappNumber: string;
  phoneNumber: string;
  email: string | null;
  photoUrl: string | null;
};

const SELECT = {
  id: true,
  nameEn: true,
  nameTh: true,
  positionEn: true,
  positionTh: true,
  whatsappNumber: true,
  phoneNumber: true,
  email: true,
  photoUrl: true,
  translations: true,
} as const;

type Row = {
  id: string;
  nameEn: string;
  nameTh: string;
  positionEn: string;
  positionTh: string;
  whatsappNumber: string;
  phoneNumber: string;
  email: string | null;
  photoUrl: string | null;
  translations: { locale: string; name: string; position: string | null }[];
};

/** Active sales team members, curated order. */
export async function getSalesTeam(locale: string): Promise<SalesPerson[]> {
  const db = prisma as any;

  const rows: Row[] = await safeQuery(
    "salesPerson.findMany(active)",
    () =>
      db.salesPerson.findMany({
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
      name: t?.name ?? pickLocale(locale, row.nameTh, row.nameEn),
      position: t?.position ?? pickLocale(locale, row.positionTh, row.positionEn),
      whatsappNumber: row.whatsappNumber,
      phoneNumber: row.phoneNumber,
      email: row.email,
      photoUrl: row.photoUrl,
    };
  });
}
