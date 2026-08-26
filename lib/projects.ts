/**
 * lib/projects.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only data access for Project / ProjectProgress.
 *
 * Two jobs:
 *  1. Keep Prisma queries out of page components.
 *  2. Serialize Prisma Decimal/Date into plain values so records can cross
 *     the server→client boundary (ProgressGallery is a client component).
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { cache } from "react";
import type { Prisma, PropertyType, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { UNIT_STATUSES } from "@/lib/validations";
import {
  EMPTY_FILTERS,
  type ProjectFilters,
  type SortOption,
} from "@/lib/project-filters";

/**
 * Derived from UNIT_STATUSES rather than imported as Prisma's generated
 * `UnitStatus` type. The two are required to be identical — Prisma's is
 * generated straight from the `enum UnitStatus` in schema.prisma, and
 * lib/validations.ts's `unitStatusPatchSchema` already validates against
 * this exact array — so this is one definition doing double duty, not a
 * second source of truth to keep in sync by hand.
 *
 * Re-exported so components can import it from here without reaching into
 * @prisma/client directly.
 */
export type UnitStatus = (typeof UNIT_STATUSES)[number];

// Imported for use below, and re-exported so existing callers keep working.
// `export … from` alone would re-export without binding it in this scope.
// The definitions live in lib/locale.ts, which imports nothing.
import { pickLocale } from "@/lib/locale";

export { pickLocale, type Locale } from "@/lib/locale";

// getTranslation() is the Translation-table equivalent of pickLocale() —
// see lib/get-translation.ts. Both are used below, side by side: a field
// tries its Translation row first, then falls back to the deprecated
// EN/TH column pair via pickLocale() when no row exists yet (a record
// seeded before the 20260820010000 migration's backfill, or a fresh one
// with no translations at all). `?? pickLocale(...)` is the shared idiom
// for that everywhere in this file — see getProjectBySlug for the first
// example.
import { getTranslation } from "@/lib/get-translation";

/** Prisma Decimal → number (safe for the magnitudes we store). */
function toNumber(value: Prisma.Decimal | number | null): number | null {
  return value === null ? null : Number(value);
}

// ── Serialized shapes handed to components ──────────────────────────────

export type ProjectCard = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  location: string;
  propertyType: string;
  status: string;
  totalUnits: number | null;
  landAreaSqm: number | null;
  heroImageUrl: string | null;
};

export type FloorPlanSummary = {
  id: string;
  floorName: string;
  imageUrl: string;
  sortOrder: number;
};

export type UnitTypeSummary = {
  id: string;
  name: string;
  descriptionEn: string | null;
  descriptionTh: string | null;
  description: string;       // locale-picked
  livingAreaSqm: number | null;
  landAreaSqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  restrooms: number | null;
  totalUnits: number | null;
  coverImageUrl: string | null;
  gallery: string[];
  sortOrder: number;
  floorPlans: FloorPlanSummary[];
};

/** One polygon vertex — percentage (0-100) of the master plan image's
 *  width/height. See the field comment on ProjectUnit.shapePoints in
 *  schema.prisma. */
export type ShapePoint = { x: number; y: number };

export type ProjectUnitSummary = {
  id: string;
  unitNumber: string;
  unitTypeId: string | null;
  unitTypeName: string | null;
  status: UnitStatus;
  shapePoints: ShapePoint[] | null;
  positionXPercent: number | null;
  positionYPercent: number | null;
  landAreaSqm: number | null;
  sortOrder: number;
};

export type AttractionSummary = {
  id: string;
  category: string;
  nameEn: string;
  nameTh: string | null;
  name: string;              // locale-picked
  distanceKm: number | null;
  travelTimeMin: number | null;
  sortOrder: number;
};

/** One row of Project.specialFeatures (Json). See the field comment in
 *  schema.prisma — presentational copy, no relation of its own. */
export type SpecialFeature = {
  titleEn: string;
  titleTh: string | null;
  detailEn: string;
  detailTh: string | null;
  title: string; // locale-picked
  detail: string; // locale-picked
};

/** Defensive parse: Json columns carry no schema guarantee at the type
 *  level, so a malformed or legacy-shaped row is dropped rather than
 *  thrown on — one bad row should not 500 the whole project page. */
function parseSpecialFeatures(
  raw: unknown,
  locale: string,
): SpecialFeature[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const titleEn = typeof entry.titleEn === "string" ? entry.titleEn : "";
      const titleTh = typeof entry.titleTh === "string" ? entry.titleTh : null;
      const detailEn = typeof entry.detailEn === "string" ? entry.detailEn : "";
      const detailTh = typeof entry.detailTh === "string" ? entry.detailTh : null;
      return {
        titleEn,
        titleTh,
        detailEn,
        detailTh,
        title: pickLocale(locale, titleTh, titleEn),
        detail: pickLocale(locale, detailTh, detailEn),
      };
    })
    .filter((feature) => feature.title !== "" || feature.detail !== "");
}

/** One full-bleed photo card in the "Facilities" section. Locale-picked
 *  here (unlike lib/awards.ts's raw titleEn/Th) — same convention as
 *  getNearbyAttractions/getUnitTypesForProject on this page, which already
 *  take `locale` and hand back a picked `name`/`description`, rather than
 *  lib/awards.ts's pattern (built for a client component that picks the
 *  language itself). `nameEn`/`nameTh` are kept alongside `name` only so
 *  the public page can match a facility back to its FACILITY_NAME_ICON
 *  entry, which is keyed in English regardless of the visitor's locale. */
export type ProjectFacilitySummary = {
  id: string;
  nameEn: string;
  nameTh: string;
  name: string; // locale-picked
  imageUrl: string | null;
  sortOrder: number;
};

export type NearbyAttractionItemSummary = {
  id: string;
  name: string;
  distanceKm: number;
  durationMin: number;
};

export type NearbyAttractionCategorySummary = {
  id: string;
  categoryName: string;
  sortOrder: number;
  items: NearbyAttractionItemSummary[];
};

export type ProjectDetail = ProjectCard & {
  description: string;
  projectArea: string | null;
  facilities: string[];
  gallery: string[];
  brochureUrl: string | null;
  masterPlanImageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string | null;
  /// "IMAGE" | "VIDEO" — see the schema.prisma comment on
  /// Project.heroMediaType. Kept as a plain string (not the Prisma enum
  /// type) for the same reason every other enum in this file's serialized
  /// shapes is — components importing from here shouldn't need @prisma/client.
  heroMediaType: string;
  heroVideoUrl: string | null;
  metaTitle: string;
  metaDescription: string;
  /// Sale Kit "Concept Design" narrative. See the schema.prisma comment on
  /// Project.conceptDesignEn/Th for how this differs from `description`.
  conceptDesign: string;
  /// Sale Kit "About This Project" background/heritage copy — only some
  /// projects have one (e.g. The Victory's Thalang history), hence the
  /// section this drives on the public page is conditional on it, unlike
  /// `conceptDesign` which every seeded project has.
  aboutThisProject: string | null;
  /// Not bilingual — an image has no language. Null falls back to a
  /// text-only rendering of the section rather than breaking the layout;
  /// see the section markup on the project page for how.
  conceptDesignImageUrl: string | null;
  aboutThisProjectImageUrl: string | null;
  specialFeatures: SpecialFeature[];
};

export type ProgressMonth = {
  id: string;
  year: number;
  month: number;
  title: string;
  summary: string;
  images: string[];
};

/**
 * Sort option → Prisma orderBy.
 *
 * Every branch ends with a deterministic tiebreaker. Without one, two
 * projects with the same createdAt (or none at all) can swap places between
 * requests, which looks like a bug and breaks any future pagination.
 */
function buildOrderBy(sort: SortOption): Prisma.ProjectOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" }, { slug: "asc" }];
    case "featured":
    default:
      // The order the team curated in the admin.
      return [{ sortOrder: "asc" }, { createdAt: "desc" }, { slug: "asc" }];
  }
}

// ── Queries ─────────────────────────────────────────────────────────────

/**
 * Published, non-deleted project by slug. Returns null for unknown or
 * unpublished slugs — and also when the database is unreachable, so callers
 * should check isDatabaseOffline() before deciding it's a genuine 404.
 * `cache()` dedupes the call between generateMetadata() and the page body.
 */
export const getProjectBySlug = cache(
  async (slug: string, locale: string): Promise<ProjectDetail | null> => {
    // sandbox: as-any cast — conceptDesignEn/Th, aboutThisProjectEn/Th and
    // specialFeatures were added to Project in this phase; see the cast
    // note above the rich-content block in prisma/seed.ts for why the
    // locally generated client doesn't type them yet. The plain query
    // below is otherwise identical to every other call in this file.
    const project: any = await safeQuery(
      `project.findUnique(${slug})`,
      () =>
        (prisma as any).project.findUnique({
          where: { slug },
          include: { translations: true },
        }),
      null,
    );

    if (!project || !project.isPublished || project.deletedAt) return null;

    const t = getTranslation<any>(project.translations, locale);
    const hasAboutThisProject = t?.aboutThisProject != null || Boolean(project.aboutThisProjectEn);

    return {
      id: project.id,
      slug: project.slug,
      name: t?.name ?? pickLocale(locale, project.nameTh, project.nameEn),
      tagline: t?.tagline ?? pickLocale(locale, project.taglineTh, project.taglineEn),
      description: t?.description ?? pickLocale(locale, project.descriptionTh, project.descriptionEn),
      location: project.location,
      propertyType: project.propertyType,
      status: project.status,
      totalUnits: project.totalUnits,
      landAreaSqm: toNumber(project.landAreaSqm),
      projectArea: project.projectArea,
      facilities: project.facilities,
      heroImageUrl: project.heroImageUrl,
      gallery: project.gallery,
      brochureUrl: project.brochureUrl,
      masterPlanImageUrl: project.masterPlanImageUrl,
      latitude: toNumber(project.latitude),
      longitude: toNumber(project.longitude),
      googleMapsUrl: project.googleMapsUrl,
      heroMediaType: project.heroMediaType ?? "IMAGE",
      heroVideoUrl: project.heroVideoUrl,
      metaTitle: t?.metaTitle ?? pickLocale(locale, project.metaTitleTh, project.metaTitleEn),
      metaDescription:
        t?.metaDescription ??
        pickLocale(locale, project.metaDescriptionTh, project.metaDescriptionEn),
      conceptDesign:
        t?.conceptDesign ?? pickLocale(locale, project.conceptDesignTh, project.conceptDesignEn),
      aboutThisProject: hasAboutThisProject
        ? t?.aboutThisProject ??
          pickLocale(locale, project.aboutThisProjectTh, project.aboutThisProjectEn)
        : null,
      conceptDesignImageUrl: project.conceptDesignImageUrl ?? null,
      aboutThisProjectImageUrl: project.aboutThisProjectImageUrl ?? null,
      specialFeatures: parseSpecialFeatures(project.specialFeatures, locale),
    };
  },
);

/**
 * Published projects for the listing grid.
 *
 * Filtering happens in Postgres rather than in JavaScript after the fetch.
 * With five projects the difference is nothing; with fifty it is the
 * difference between a query and a full table read on every page view, and
 * the shape of the code should not have to change when that day arrives.
 */
export async function getPublishedProjects(
  locale: string,
  filters: ProjectFilters = EMPTY_FILTERS,
): Promise<ProjectCard[]> {
  const where: Prisma.ProjectWhereInput = {
    isPublished: true,
    deletedAt: null,
    ...(filters.propertyType ? { propertyType: filters.propertyType as PropertyType } : {}),
    ...(filters.status ? { status: filters.status as ProjectStatus } : {}),
  };

  const orderBy = buildOrderBy(filters.sort);

  const projects: any[] = await safeQuery(
    "project.findMany(published)",
    () => (prisma as any).project.findMany({ where, orderBy, include: { translations: true } }),
    [],
  );

  return projects.map((project) => {
    const t = getTranslation<any>(project.translations, locale);

    return {
      id: project.id,
      slug: project.slug,
      name: t?.name ?? pickLocale(locale, project.nameTh, project.nameEn),
      tagline: t?.tagline ?? pickLocale(locale, project.taglineTh, project.taglineEn),
      location: project.location,
      propertyType: project.propertyType,
      status: project.status,
      totalUnits: project.totalUnits,
      landAreaSqm: toNumber(project.landAreaSqm),
      heroImageUrl: project.heroImageUrl,
    };
  });
}

/**
 * Which facet values actually exist among published projects.
 *
 * The filter bar only offers these. Presenting the full enum would let a
 * visitor pick "Commercial" and land on an empty result set — a dead end
 * they had no way to predict. Offering only what returns something means
 * every filter click produces at least one card.
 */
export async function getProjectFacets(): Promise<{
  propertyTypes: string[];
  statuses: string[];
  total: number;
}> {
  const rows = await safeQuery(
    "project.findMany(facets)",
    () =>
      prisma.project.findMany({
        where: { isPublished: true, deletedAt: null },
        select: { propertyType: true, status: true },
      }),
    [] as { propertyType: PropertyType; status: ProjectStatus }[],
  );

  return {
    propertyTypes: [...new Set(rows.map((row) => row.propertyType))],
    statuses: [...new Set(rows.map((row) => row.status))],
    total: rows.length,
  };
}

/** Slugs for generateStaticParams(). Empty array if the DB is unreachable
 *  at build time — dynamicParams then renders on demand. */
export async function getPublishedProjectSlugs(): Promise<string[]> {
  const rows = await safeQuery(
    "project.findMany(slugs)",
    () =>
      prisma.project.findMany({
        where: { isPublished: true, deletedAt: null },
        select: { slug: true },
      }),
    [] as { slug: string }[],
  );
  return rows.map((r) => r.slug);
}

export type ProjectProgressSummary = {
  id: string;
  slug: string;
  name: string;
  location: string;
  status: string;
  heroImageUrl: string | null;
  updateCount: number;
  /** Most recent published month, or null if none. */
  latest: { year: number; month: number; title: string; image: string | null } | null;
};

/**
 * Published projects that have at least one published progress update,
 * newest activity first.
 *
 * Ordering by latest update rather than sortOrder is deliberate: this page
 * exists to show that work is happening, so the site with photographs from
 * last week belongs above the one last updated in March.
 */
export async function getProjectsWithProgress(
  locale: string,
): Promise<ProjectProgressSummary[]> {
  const projects: any[] = await safeQuery(
    "project.findMany(withProgress)",
    () =>
      (prisma as any).project.findMany({
        where: {
          isPublished: true,
          deletedAt: null,
          progressUpdates: { some: { isPublished: true } },
        },
        select: {
          id: true,
          slug: true,
          nameEn: true,
          nameTh: true,
          translations: true,
          location: true,
          status: true,
          heroImageUrl: true,
          _count: { select: { progressUpdates: { where: { isPublished: true } } } },
          progressUpdates: {
            where: { isPublished: true },
            orderBy: [{ year: "desc" }, { month: "desc" }],
            take: 1,
            select: {
              year: true,
              month: true,
              titleEn: true,
              titleTh: true,
              images: true,
            },
          },
        },
      }),
    [],
  );

  return projects
    .map((project) => {
      const latest = project.progressUpdates[0];
      const t = getTranslation<any>(project.translations, locale);

      return {
        id: project.id,
        slug: project.slug,
        name: t?.name ?? pickLocale(locale, project.nameTh, project.nameEn),
        location: project.location,
        status: project.status,
        heroImageUrl: project.heroImageUrl,
        updateCount: project._count.progressUpdates,
        latest: latest
          ? {
              year: latest.year,
              month: latest.month,
              title: pickLocale(locale, latest.titleTh, latest.titleEn),
              // The month's first photograph is the most current image of
              // the site — better than a marketing render for this page.
              image: latest.images[0] ?? null,
            }
          : null,
      };
    })
    .sort((a, b) => {
      if (!a.latest || !b.latest) return 0;
      return (
        b.latest.year - a.latest.year || b.latest.month - a.latest.month
      );
    });
}

/** Published monthly construction updates, newest last (chronological tabs). */
export async function getProjectProgress(
  projectId: string,
  locale: string,
): Promise<ProgressMonth[]> {
  const updates = await safeQuery(
    "projectProgress.findMany",
    () =>
      prisma.projectProgress.findMany({
        where: { projectId, isPublished: true },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      }),
    [],
  );

  return updates.map((u) => ({
    id: u.id,
    year: u.year,
    month: u.month,
    title: pickLocale(locale, u.titleTh, u.titleEn),
    summary: pickLocale(locale, u.summaryTh, u.summaryEn),
    images: u.images,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// UNIT TYPES / UNITS / NEARBY ATTRACTIONS — Rich Project Content (Sale-Kit
// parity). All three query the models restored/added in this phase; see
// the as-any cast note on getProjectBySlug above for why `prisma as any`
// appears throughout — it wears off the moment `prisma generate` runs for
// real against the current schema.prisma.
// ─────────────────────────────────────────────────────────────────────────

/** Unit types for the "Unit Types" table on a project page, each with its
 *  floor plan images in display order. */
export async function getUnitTypesForProject(
  projectId: string,
  locale: string,
): Promise<UnitTypeSummary[]> {
  const db = prisma as any;

  const types = await safeQuery(
    `projectUnitType.findMany(${projectId})`,
    () =>
      db.projectUnitType.findMany({
        where: { projectId },
        orderBy: { sortOrder: "asc" },
        include: {
          floorPlans: { orderBy: { sortOrder: "asc" } },
          translations: true,
        },
      }),
    [] as any[],
  );

  return types.map((t: any) => {
    const tr = getTranslation<any>(t.translations, locale);

    return {
    id: t.id,
    name: t.name,
    descriptionEn: t.descriptionEn,
    descriptionTh: t.descriptionTh,
    description: tr?.description ?? pickLocale(locale, t.descriptionTh, t.descriptionEn),
    livingAreaSqm: toNumber(t.livingAreaSqm),
    landAreaSqm: toNumber(t.landAreaSqm),
    bedrooms: t.bedrooms,
    bathrooms: t.bathrooms,
    restrooms: t.restrooms,
    totalUnits: t.totalUnits,
    coverImageUrl: t.coverImageUrl,
    gallery: t.gallery,
    sortOrder: t.sortOrder,
    floorPlans: t.floorPlans.map((fp: any) => ({
      id: fp.id,
      floorName: fp.floorName,
      imageUrl: fp.imageUrl,
      sortOrder: fp.sortOrder,
    })),
    };
  });
}

/** Individual plots for the Site Plan + Unit Status section — one row per
 *  physical unit, each carrying its own sale status. */
export async function getProjectUnits(projectId: string): Promise<ProjectUnitSummary[]> {
  const db = prisma as any;

  const units = await safeQuery(
    `projectUnit.findMany(${projectId})`,
    () =>
      db.projectUnit.findMany({
        where: { projectId },
        orderBy: [{ sortOrder: "asc" }, { unitNumber: "asc" }],
        include: { unitType: { select: { name: true } } },
      }),
    [] as any[],
  );

  return units.map((u: any) => ({
    id: u.id,
    unitNumber: u.unitNumber,
    unitTypeId: u.unitTypeId,
    unitTypeName: u.unitType?.name ?? null,
    status: u.status as UnitStatus,
    shapePoints: (u.shapePoints as ShapePoint[] | null) ?? null,
    positionXPercent: toNumber(u.positionXPercent),
    positionYPercent: toNumber(u.positionYPercent),
    landAreaSqm: toNumber(u.landAreaSqm),
    sortOrder: u.sortOrder,
  }));
}

/**
 * Nearby-attraction categories for a project, falling back to the shared
 * default set (projectId = null) when the project has none of its own.
 *
 * The fallback is all-or-nothing by design — a project's own categories
 * replace the shared list entirely rather than merging with it, matching
 * the model comment in schema.prisma. Partial merging would make "why is
 * Beach missing here but not there" an admin-support question instead of
 * a one-glance answer.
 */
export async function getNearbyAttractions(
  projectId: string,
  locale: string,
): Promise<NearbyAttractionCategorySummary[]> {
  const db = prisma as any;

  const itemsInclude = { orderBy: { sortOrder: "asc" as const }, include: { translations: true } };

  const ownCategories = await safeQuery(
    `nearbyAttractionCategory.findMany(${projectId})`,
    () =>
      db.nearbyAttractionCategory.findMany({
        where: { projectId },
        orderBy: { sortOrder: "asc" },
        include: { items: itemsInclude, translations: true },
      }),
    [] as any[],
  );

  const categories =
    ownCategories.length > 0
      ? ownCategories
      : await safeQuery(
          "nearbyAttractionCategory.findMany(shared-default)",
          () =>
            db.nearbyAttractionCategory.findMany({
              where: { projectId: null },
              orderBy: { sortOrder: "asc" },
              include: { items: itemsInclude, translations: true },
            }),
          [] as any[],
        );

  return categories.map((cat: any) => {
    const catT = getTranslation<any>(cat.translations, locale);

    return {
      id: cat.id,
      categoryName: catT?.categoryName ?? pickLocale(locale, cat.categoryNameTh, cat.categoryNameEn),
      sortOrder: cat.sortOrder,
      items: cat.items.map((item: any) => {
        const itemT = getTranslation<any>(item.translations, locale);
        return {
          id: item.id,
          name: itemT?.name ?? pickLocale(locale, item.nameTh, item.nameEn),
          distanceKm: toNumber(item.distanceKm) ?? 0,
          durationMin: item.durationMin,
        };
      }),
    };
  });
}

/**
 * Active facility photo cards for one project, in curated order — drives
 * the "Facilities" section on the project page. See the model comment on
 * ProjectFacility in schema.prisma for why this is a child table rather
 * than the plain `facilities` string array (now deprecated) on Project.
 *
 * sandbox: `prisma as any` — see the cast note above getProjectBySlug.
 */
export async function getProjectFacilities(
  projectId: string,
  locale: string,
): Promise<ProjectFacilitySummary[]> {
  const db = prisma as any;

  const rows = await safeQuery(
    `projectFacility.findMany(${projectId})`,
    () =>
      db.projectFacility.findMany({
        where: { projectId, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { translations: true },
      }),
    [] as any[],
  );

  return rows.map((f: any) => {
    const t = getTranslation<any>(f.translations, locale);

    return {
      id: f.id,
      nameEn: f.nameEn,
      nameTh: f.nameTh,
      name: t?.name ?? pickLocale(locale, f.nameTh, f.nameEn),
      imageUrl: f.imageUrl,
      sortOrder: f.sortOrder,
    };
  });
}
