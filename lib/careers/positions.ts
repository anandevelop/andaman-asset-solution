/**
 * lib/careers/positions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The positions on offer. Public reads go through getOpenPositions; every
 * write is behind the manageCareers capability at its call site.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { getTranslation } from "@/lib/get-translation";
import { locales, type Locale } from "@/i18n";
import { EMPLOYMENT_TYPES, type EmploymentType } from "@/lib/careers/fields";

export type PublicPosition = {
  id: string;
  title: string;
  location: string | null;
  summary: string | null;
  employmentType: EmploymentType;
};

const asType = (value: string): EmploymentType =>
  (EMPLOYMENT_TYPES as readonly string[]).includes(value) ? (value as EmploymentType) : "full_time";

/** Open positions in the visitor's language, in the order HR arranged. */
export async function getOpenPositions(locale: string): Promise<PublicPosition[]> {
  const rows = await safeQuery(
    "careers:openPositions",
    () =>
      prisma.jobPosition.findMany({
        where: { isOpen: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { translations: true },
      }),
    [],
  );

  return rows.flatMap((row) => {
    const translation = getTranslation(row.translations, locale);
    // A position with no title in any language has nothing to show.
    if (!translation?.title) return [];
    return [
      {
        id: row.id,
        title: translation.title,
        location: translation.location || null,
        summary: translation.summary || null,
        employmentType: asType(row.employmentType),
      },
    ];
  });
}

export type AdminPosition = {
  id: string;
  employmentType: EmploymentType;
  isOpen: boolean;
  sortOrder: number;
  applications: number;
  translations: Record<Locale, { title: string; location: string; summary: string }>;
};

export async function listPositions(): Promise<AdminPosition[]> {
  const rows = await prisma.jobPosition.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { translations: true, _count: { select: { applications: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    employmentType: asType(row.employmentType),
    isOpen: row.isOpen,
    sortOrder: row.sortOrder,
    applications: row._count.applications,
    translations: Object.fromEntries(
      locales.map((locale) => {
        const translation = row.translations.find((entry) => entry.locale === locale);
        return [
          locale,
          { title: translation?.title ?? "", location: translation?.location ?? "", summary: translation?.summary ?? "" },
        ];
      }),
    ) as AdminPosition["translations"],
  }));
}

export type PositionInput = {
  employmentType: EmploymentType;
  isOpen: boolean;
  translations: Partial<Record<Locale, { title: string; location: string; summary: string }>>;
};

/** Create (no id) or replace a position and its translations. */
export async function savePosition(id: string | null, input: PositionInput): Promise<string> {
  const rows = locales.flatMap((locale) => {
    const entry = input.translations[locale];
    const title = entry?.title.trim() ?? "";
    // A language left without a title is not saved; the site falls back.
    if (!title) return [];
    return [{ locale, title, location: entry?.location.trim() || null, summary: entry?.summary.trim() || null }];
  });
  if (rows.length === 0) throw new Error("TITLE_REQUIRED");

  if (!id) {
    const last = await prisma.jobPosition.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.jobPosition.create({
      data: {
        employmentType: input.employmentType,
        isOpen: input.isOpen,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
        translations: { create: rows },
      },
    });
    return created.id;
  }

  await prisma.$transaction([
    prisma.jobPositionTranslation.deleteMany({ where: { positionId: id } }),
    prisma.jobPosition.update({
      where: { id },
      data: { employmentType: input.employmentType, isOpen: input.isOpen, translations: { create: rows } },
    }),
  ]);
  return id;
}

export async function setPositionOpen(id: string, isOpen: boolean): Promise<void> {
  await prisma.jobPosition.update({ where: { id }, data: { isOpen } });
}

/** Swap a position with its neighbour. */
export async function movePosition(id: string, direction: "up" | "down"): Promise<void> {
  const rows = await prisma.jobPosition.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const index = rows.findIndex((row) => row.id === id);
  const other = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || other < 0 || other >= rows.length) return;
  [rows[index], rows[other]] = [rows[other], rows[index]];
  await prisma.$transaction(
    rows.map((row, sortOrder) => prisma.jobPosition.update({ where: { id: row.id }, data: { sortOrder } })),
  );
}

/**
 * Remove a position. Its applications stay — positionId goes null and
 * positionTitle still says what each was for.
 */
export async function deletePosition(id: string): Promise<void> {
  await prisma.jobPosition.delete({ where: { id } });
}
