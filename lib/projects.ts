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
import { getNearbyAttractionCategories } from "@/content/nearby-attractions";

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
import { getYouTubeEmbedUrl } from "@/lib/youtube";

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

/**
 * The one thing worth saying about a project beyond its specification —
 * an award it won, or how many construction photos are on record.
 *
 * Derived, never stored: `kind` decides the icon and which translation
 * key the card reads, and the numbers come with it. Null when there is
 * nothing true to say, and the card then shows no second badge rather
 * than a filler one.
 */
export type ProjectSignal =
  | { kind: "awards"; count: number; year: number }
  | { kind: "progressPhotos"; count: number; year: number; month: number };

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

/**
 * A card on a listing page, which shows more than the detail page's own
 * header needs.
 *
 * Separate from ProjectCard rather than folded into it because
 * ProjectDetail extends ProjectCard, and a detail page has no use for a
 * bedroom span it renders a full unit-type table for. `facilityNames`, not
 * `facilities`: ProjectDetail already carries a `facilities` string array
 * from the deprecated column, and two fields of the same name meaning
 * different things is a bug waiting for somebody to read the wrong one.
 */
export type ProjectListCard = ProjectCard & {
  /** Bedroom span across this project's unit types — equal when it offers
   *  only one size, null when no unit type records a bedroom count. */
  bedroomsMin: number | null;
  bedroomsMax: number | null;
  /** Active facilities in the order an administrator arranged them,
   *  already locale-picked. The card shows the first few. */
  facilityNames: string[];
  signal: ProjectSignal | null;
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
  /** The unit type's own spec — for the site plan's selected-plot detail
   *  panel (bedrooms/bathrooms/living area), which has nothing else to
   *  read this from. Null whenever unitTypeId is, or when that type
   *  hasn't had the figure filled in. */
  unitTypeBedrooms: number | null;
  unitTypeBathrooms: number | null;
  unitTypeLivingAreaSqm: number | null;
  status: UnitStatus;
  shapePoints: ShapePoint[] | null;
  positionXPercent: number | null;
  positionYPercent: number | null;
  landAreaSqm: number | null;
  sortOrder: number;
  /** Sales phase, when this project releases in stages — see the field
   *  comment on ProjectUnit.phase. Null on the (majority) single-release
   *  projects. No longer read by the public site plan (SitePlanMap.tsx
   *  dropped its phase tabs and filter) — kept on this type rather than
   *  trimmed, since ProjectUnit.phase itself is still very much live in
   *  the admin drawing tool, which reads it through its own query. */
  phase: number | null;
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
  /// External Matterport/Kuula/YouTube-360 link — see the schema.prisma
  /// comment on Project.virtualTourUrl. Null hides the hero's 360° Tour
  /// button entirely.
  virtualTourUrl: string | null;
  /// "IMAGE" | "VIDEO" — see the schema.prisma comment on
  /// Project.heroMediaType. Kept as a plain string (not the Prisma enum
  /// type) for the same reason every other enum in this file's serialized
  /// shapes is — components importing from here shouldn't need @prisma/client.
  heroMediaType: string;
  heroVideoUrl: string | null;
  metaTitle: string;
  metaDescription: string;
  /// Per-locale opt-out of indexing — see the schema.prisma comment on
  /// ProjectTranslation.noIndex.
  noIndex: boolean;
  /// Per-project overrides set from the admin's SEO tab; null on almost
  /// every project, in which case the page falls back to its own URL and
  /// its hero image.
  canonicalUrl: string | null;
  ogImageUrl: string | null;
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
  videoUrl: string | null;
  videoEmbedUrl: string | null;
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
    /*
      The `prisma as any` that used to wrap this call is gone, along with
      the thirty-five others it was copied to. It was added when the
      generated client genuinely predated conceptDesignEn/Th,
      aboutThisProjectEn/Th and specialFeatures; that stopped being true
      once `prisma generate` ran against the current schema, and CI has
      been running it before typecheck all along.

      The `: any` on the row below is the remaining half and is still real
      work: it stands in for the shape this query returns, which is wider
      than ProjectDetail and includes the translations relation. Typing it
      properly means naming that shape, not deleting the annotation.
    */
    const project: any = await safeQuery(
      `project.findUnique(${slug})`,
      () =>
        prisma.project.findUnique({
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
      virtualTourUrl: project.virtualTourUrl,
      heroMediaType: project.heroMediaType ?? "IMAGE",
      heroVideoUrl: project.heroVideoUrl,
      metaTitle: t?.metaTitle ?? pickLocale(locale, project.metaTitleTh, project.metaTitleEn),
      metaDescription:
        t?.metaDescription ??
        pickLocale(locale, project.metaDescriptionTh, project.metaDescriptionEn),
      noIndex: t?.noIndex ?? false,
      canonicalUrl: project.canonicalUrl ?? null,
      ogImageUrl: project.ogImageUrl ?? null,
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
 *
 * cache()d because three separate components ask for the same unfiltered
 * list on the same render — the footer's "Developments" column, the
 * closing CTA's background photograph, and the projects grid itself. React
 * dedupes them to one query per request, keyed on the arguments, so a
 * filtered call still runs its own.
 */
export const getPublishedProjects = cache(async function getPublishedProjects(
  locale: string,
  filters: ProjectFilters = EMPTY_FILTERS,
): Promise<ProjectListCard[]> {
  const where: Prisma.ProjectWhereInput = {
    isPublished: true,
    deletedAt: null,
    ...(filters.propertyType ? { propertyType: filters.propertyType as PropertyType } : {}),
    ...(filters.status ? { status: filters.status as ProjectStatus } : {}),
  };

  const orderBy = buildOrderBy(filters.sort);

  const [projects, awards] = await Promise.all([
    safeQuery(
      "project.findMany(published)",
      () =>
        prisma.project.findMany({
          where,
          orderBy,
          include: {
            translations: true,
            // Bedroom span for the card's spec row.
            unitTypes: { select: { bedrooms: true } },
            facilityItems: {
              where: { isActive: true },
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              include: { translations: true },
            },
            /*
              Every published update, newest first — the card's signal
              needs a running photo count across all of them, not just the
              latest one.
            */
            progressUpdates: {
              where: { isPublished: true },
              orderBy: [{ year: "desc" }, { month: "desc" }],
              select: { year: true, month: true, images: true },
            },
          },
        }),
      [] as any[],
    ),
    safeQuery(
      "award.findMany(byProject)",
      () =>
        prisma.award.findMany({
          where: { isActive: true, projectName: { not: null } },
          select: { projectName: true, year: true },
        }),
      [] as { projectName: string | null; year: number }[],
    ),
  ]);

  return (projects as any[]).map((project) => {
    const t = getTranslation<any>(project.translations, locale);

    const bedrooms = (project.unitTypes as { bedrooms: number | null }[])
      .map((unitType) => unitType.bedrooms)
      .filter((value): value is number => typeof value === "number");

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
      bedroomsMin: bedrooms.length > 0 ? Math.min(...bedrooms) : null,
      bedroomsMax: bedrooms.length > 0 ? Math.max(...bedrooms) : null,
      facilityNames: (project.facilityItems as any[]).map(
        (facility) =>
          getTranslation<any>(facility.translations, locale)?.name ??
          pickLocale(locale, facility.nameTh, facility.nameEn),
      ),
      signal: signalFor(project, awards),
    };
  });
});

/**
 * The one extra thing a card says about a project.
 *
 * Awards first: an award is a fact about the development that does not
 * expire, and it is the strongest thing any of these cards can say.
 * Otherwise, the running photo count across every published update —
 * not just the latest one, so a project three updates into construction
 * says "34 progress photos", not "6" — dated to the newest entry that
 * actually added one.
 *
 * Awards are matched on the exact project name an administrator typed into
 * Award.projectName. Deliberately exact: a "contains" match would hang
 * "The Residence"'s awards on any project whose name starts the same way,
 * and attributing somebody else's award to a development is a worse
 * failure than showing no badge. An award that matches nothing still
 * appears in the awards section — it just does not decorate a card.
 */
function signalFor(
  project: { nameEn: string; progressUpdates: { year: number; month: number; images: string[] }[] },
  awards: { projectName: string | null; year: number }[],
): ProjectSignal | null {
  const mine = awards.filter((award) => award.projectName === project.nameEn);

  if (mine.length > 0) {
    return {
      kind: "awards",
      count: mine.length,
      year: Math.max(...mine.map((award) => award.year)),
    };
  }

  // Already newest-first from the query, so the first entry that has any
  // images at all is the one that dates the pill.
  const withPhotos = project.progressUpdates.filter((entry) => entry.images.length > 0);
  if (withPhotos.length === 0) return null;

  const totalPhotos = withPhotos.reduce((sum, entry) => sum + entry.images.length, 0);

  return {
    kind: "progressPhotos",
    count: totalPhotos,
    year: withPhotos[0].year,
    month: withPhotos[0].month,
  };
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

/**
 * Portfolio totals for the /projects hero: how many developments, how many
 * villas and units across them, how much land between them.
 *
 * Deliberately not derived from getPublishedProjects(locale, filters).
 * That call returns the *filtered* list, and these three numbers are a
 * claim about the portfolio, not about the current search — wiring them to
 * the filtered result would make them change every time a visitor taps a
 * chip, which says something quite different. How many projects a search
 * matched already has its own home in the filter bar (`filters.results`).
 *
 * An aggregate rather than findMany + reduce: Postgres answers all three in
 * one pass and none of the rows themselves are wanted here.
 */
export async function getProjectPortfolioSummary(): Promise<{
  count: number;
  totalUnits: number;
  totalLandSqm: number;
}> {
  return safeQuery(
    "project.aggregate(portfolio)",
    async () => {
      const result = await prisma.project.aggregate({
        where: { isPublished: true, deletedAt: null },
        _count: { _all: true },
        _sum: { totalUnits: true, landAreaSqm: true },
      });

      return {
        count: result._count._all,
        totalUnits: result._sum.totalUnits ?? 0,
        // landAreaSqm is a nullable Decimal, so the sum can be null when
        // nothing has one set. Rounded because "92,353.17 sq.m" is a
        // surveyor's number, not a hero's — the same call
        // FeaturedProjectCard already makes about its own land figure.
        totalLandSqm: Math.round(toNumber(result._sum.landAreaSqm) ?? 0),
      };
    },
    // The listing page renders DbOfflineNotice for the real problem; the
    // hero above it must not be what takes the page down.
    { count: 0, totalUnits: 0, totalLandSqm: 0 },
  );
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
  latest: { year: number; month: number; image: string | null } | null;
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
      prisma.project.findMany({
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
    videoUrl: u.videoUrl,
    videoEmbedUrl: getYouTubeEmbedUrl(u.videoUrl),
    images: u.images,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// UNIT TYPES / UNITS / NEARBY ATTRACTIONS — Rich Project Content (Sale-Kit
// parity). These used to be cast through `prisma as any` because the
// generated client predated the models; it does not any more, and the
// queries below type-check as written.
// ─────────────────────────────────────────────────────────────────────────

/** Unit types for the "Unit Types" table on a project page, each with its
 *  floor plan images in display order. */
export async function getUnitTypesForProject(
  projectId: string,
  locale: string,
): Promise<UnitTypeSummary[]> {
  const db = prisma;

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
  const db = prisma;

  const units = await safeQuery(
    `projectUnit.findMany(${projectId})`,
    () =>
      db.projectUnit.findMany({
        // Unreleased plots are absent from the public plan entirely — see
        // ProjectUnit.releasedForSale. They exist on the master plan and in
        // the admin, but a visitor cannot buy one yet, so showing it would
        // only invite an enquiry the sales team has to turn down.
        where: { projectId, releasedForSale: true },
        orderBy: [{ sortOrder: "asc" }, { unitNumber: "asc" }],
        include: {
          unitType: { select: { name: true, bedrooms: true, bathrooms: true, livingAreaSqm: true } },
        },
      }),
    [] as any[],
  );

  return units.map((u: any) => ({
    id: u.id,
    unitNumber: u.unitNumber,
    unitTypeId: u.unitTypeId,
    unitTypeName: u.unitType?.name ?? null,
    unitTypeBedrooms: u.unitType?.bedrooms ?? null,
    unitTypeBathrooms: u.unitType?.bathrooms ?? null,
    unitTypeLivingAreaSqm: toNumber(u.unitType?.livingAreaSqm ?? null),
    status: u.status as UnitStatus,
    shapePoints: (u.shapePoints as ShapePoint[] | null) ?? null,
    positionXPercent: toNumber(u.positionXPercent),
    positionYPercent: toNumber(u.positionYPercent),
    landAreaSqm: toNumber(u.landAreaSqm),
    sortOrder: u.sortOrder,
    phase: u.phase ?? null,
  }));
}

export type ReservableUnit = { id: string; unitNumber: string; unitTypeName: string | null };

/**
 * Units a rep can newly reserve for a lead — the Lead Detail page's
 * minimal "unit of interest" picker (LeadDetail.dc.html), not the full
 * Units & Site Plan workflow. Deliberately just AVAILABLE units: a lead
 * already holding one shows up through its own reservedUnits relation
 * instead (see the lead's own query), and a SOLD unit is never offerable.
 */
export async function getReservableUnits(projectId: string): Promise<ReservableUnit[]> {
  return safeQuery(
    `projectUnit.reservable(${projectId})`,
    async () => {
      const units = await prisma.projectUnit.findMany({
        // releasedForSale as well as AVAILABLE: a plot held back for a
        // later phase is not something a rep can promise a lead today.
        where: { projectId, status: "AVAILABLE", releasedForSale: true },
        orderBy: [{ sortOrder: "asc" }, { unitNumber: "asc" }],
        select: { id: true, unitNumber: true, unitType: { select: { name: true } } },
      });
      return units.map((u) => ({ id: u.id, unitNumber: u.unitNumber, unitTypeName: u.unitType?.name ?? null }));
    },
    [],
  );
}

/**
 * Nearby-attraction categories shown on every project page.
 *
 * Code-owned content (content/nearby-attractions.ts), not a database query
 * — this used to be an admin-editable "shared default, project-overridable"
 * feature (NearbyAttractionCategory/Item), removed by client request once
 * it became clear the per-project override was never used in practice and
 * the shared-default admin screen was silently pointless (prisma/seed.ts
 * wiped and recreated that table every seed run, so an admin edit never
 * survived a re-seed). See content/nearby-attractions.ts's header for the
 * full reasoning. Kept `async` for call-site compatibility even though
 * there is no longer any I/O.
 */
export async function getNearbyAttractions(
  locale: string,
): Promise<NearbyAttractionCategorySummary[]> {
  return getNearbyAttractionCategories(locale);
}

/**
 * Active facility photo cards for one project, in curated order — drives
 * the "Facilities" section on the project page. See the model comment on
 * ProjectFacility in schema.prisma for why this is a child table rather
 * than the plain `facilities` string array (now deprecated) on Project.
 */
export async function getProjectFacilities(
  projectId: string,
  locale: string,
): Promise<ProjectFacilitySummary[]> {
  const db = prisma;

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
