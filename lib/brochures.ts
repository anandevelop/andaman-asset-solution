/**
 * lib/brochures.ts
 * ─────────────────────────────────────────────────────────────────────────
 * E-brochures — the PDF flipbooks at /e-brochure and /e-brochure/<slug>.
 *
 * Same shape as lib/hero-story.ts: server-only queries that resolve each
 * row's Translation-table copy for the requesting locale and hand the page
 * a plain, already-localized object. The viewer is a Client Component (it
 * drives pdf.js and a canvas), so it must never see Prisma or next-intl's
 * server APIs — every string it renders arrives as a prop.
 *
 * `fileUrl` is not translated. One PDF serves all four locales, the same
 * call Project.brochureUrl makes; a Thai-only edition is a separate row
 * with its own slug. That keeps this module from having to answer "which
 * file does a zh visitor get when only th and en exist", which has no good
 * answer for a binary.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { getTranslation } from "@/lib/get-translation";
import { pickLocale } from "@/lib/locale";

export type EBrochureCard = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  /** Null falls back to an icon tile — see AwardsSection's trophy icon. */
  coverImageUrl: string | null;
  /** The development this brochure is for, already localized. */
  projectName: string | null;
};

export type EBrochureDetail = EBrochureCard & {
  fileUrl: string;
  projectSlug: string | null;
  updatedAt: Date;
};

const SELECT = {
  id: true,
  slug: true,
  fileUrl: true,
  coverImageUrl: true,
  updatedAt: true,
  translations: true,
  project: {
    select: { slug: true, nameEn: true, nameTh: true, translations: true },
  },
} as const;

type Row = {
  id: string;
  slug: string;
  fileUrl: string;
  coverImageUrl: string | null;
  updatedAt: Date;
  translations: { locale: string; title: string; description: string | null }[];
  project: {
    slug: string;
    nameEn: string;
    nameTh: string;
    translations: { locale: string; name: string }[];
  } | null;
};

/**
 * The project's name in the visitor's language.
 *
 * Two steps, not one: Project predates the four-locale migration and still
 * carries the deprecated nameEn/nameTh pair, so a project with no zh
 * Translation row would otherwise render an empty string rather than the
 * English name it does have. EBrochure itself needs no such fallback — it
 * was created after the migration and has no legacy columns.
 */
function projectName(row: Row, locale: string): string | null {
  if (!row.project) return null;

  const translated = getTranslation(row.project.translations, locale);

  return (
    translated?.name || pickLocale(locale, row.project.nameTh, row.project.nameEn) || null
  );
}

function toCard(row: Row, locale: string): EBrochureCard {
  const t = getTranslation(row.translations, locale);

  return {
    id: row.id,
    slug: row.slug,
    title: t?.title ?? "",
    description: t?.description ?? null,
    coverImageUrl: row.coverImageUrl,
    projectName: projectName(row, locale),
  };
}

/** Published brochures in display order, for the index page. */
export async function getPublishedBrochures(locale: string): Promise<EBrochureCard[]> {
  const rows = await safeQuery(
    "eBrochure.findMany(published)",
    () =>
      prisma.eBrochure.findMany({
        where: { isPublished: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: SELECT,
      }) as unknown as Promise<Row[]>,
    [] as Row[],
  );

  return rows.map((row) => toCard(row, locale));
}

/**
 * One published brochure, or null.
 *
 * Null covers both "no such slug" and "not published", which the page
 * turns into a 404 — but only after checking isDatabaseOffline(), because
 * an unreachable database looks identical here and must not be cached as a
 * 404. See the same guard on the project detail page.
 */
export async function getBrochureBySlug(
  slug: string,
  locale: string,
): Promise<EBrochureDetail | null> {
  const row = await safeQuery(
    "eBrochure.findFirst(slug)",
    () =>
      prisma.eBrochure.findFirst({
        where: { slug, isPublished: true },
        select: SELECT,
      }) as unknown as Promise<Row | null>,
    null as Row | null,
  );

  if (!row) return null;

  return {
    ...toCard(row, locale),
    fileUrl: row.fileUrl,
    projectSlug: row.project?.slug ?? null,
    updatedAt: row.updatedAt,
  };
}

/** Slugs for generateStaticParams. */
export async function getPublishedBrochureSlugs(): Promise<string[]> {
  const rows = await safeQuery(
    "eBrochure.findMany(slugs)",
    () =>
      prisma.eBrochure.findMany({
        where: { isPublished: true },
        select: { slug: true },
        orderBy: { sortOrder: "asc" },
      }),
    [] as { slug: string }[],
  );

  return rows.map((row) => row.slug);
}

/**
 * Projects a brochure can be attached to, for the admin's select.
 *
 * nameEn rather than the translated name: this picker exists to identify a
 * row unambiguously for whoever is editing, and the English project names
 * are what the rest of the admin shows too (see the leads table). Lives
 * here rather than in the page so the page file exports only its
 * component, which is all Next expects to find there.
 */
export async function getBrochureProjectOptions(): Promise<
  { id: string; name: string }[]
> {
  const rows = await safeQuery(
    "admin:e-brochures:projects",
    () =>
      prisma.project.findMany({
        where: { deletedAt: null },
        select: { id: true, nameEn: true },
        orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
      }),
    [] as { id: string; nameEn: string }[],
  );

  return rows.map((row) => ({ id: row.id, name: row.nameEn }));
}

/**
 * Sitemap entries. Falls back to an empty list rather than throwing, so a
 * database blip yields a short sitemap instead of a 500 — same contract as
 * getArticleSitemapEntries.
 */
export async function getBrochureSitemapEntries(): Promise<
  { slug: string; updatedAt: Date }[]
> {
  return safeQuery(
    "eBrochure.findMany(sitemap)",
    () =>
      prisma.eBrochure.findMany({
        where: { isPublished: true },
        select: { slug: true, updatedAt: true },
        orderBy: { sortOrder: "asc" },
      }),
    [] as { slug: string; updatedAt: Date }[],
  );
}
