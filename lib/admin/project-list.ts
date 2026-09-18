import "server-only";

/**
 * lib/admin/project-list.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Read side of the admin Projects index (Projects.dc.html) — search, the
 * four filters, sorting, pagination, and the three per-row facts the plain
 * list never had: how many units are still available, how filled-in each
 * of the four languages is, and who last touched the row.
 *
 * WHY SO MUCH OF THIS RUNS IN MEMORY.
 *
 * Two of the columns cannot be expressed as SQL against this schema. The
 * displayed name comes from getTranslation()'s locale-fallback chain
 * (ProjectTranslation → the deprecated nameEn/nameTh pair), so sorting by
 * name means sorting by a value the database cannot compute; and "a
 * language is missing" is the absence of a matching translation row, which
 * Prisma cannot filter on per-locale without four correlated subqueries.
 * Doing those two in JS means the page size has to be applied afterwards,
 * so pagination follows them.
 *
 * That trade is priced against the real table: a property developer's
 * project list is dozens of rows, not millions — the whole filtered set is
 * one indexed query and a few hundred kilobytes. MAX_ROWS below is the
 * guard rail if that assumption ever stops holding.
 *
 * The two aggregate lookups (unit tallies, last editor) stay in the
 * database, one query each for the whole page rather than one per row —
 * see lib/publishing.ts's lastActorFor for the per-row version this
 * deliberately does not copy.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { ContentStatus, Prisma, ProjectStatus, PropertyType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { getTranslation } from "@/lib/get-translation";
import { localeFills, type LocaleFill } from "@/lib/locale-completeness";
import { AUDIT_MODEL_NAME } from "@/lib/content-revisions";

/**
 * Ceiling on the filtered set held in memory at once. Far above this
 * site's real project count; here so that a future import of every plot
 * in Phuket degrades into a truncated page rather than an OOM.
 */
const MAX_ROWS = 1_000;

export const PER_PAGE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PER_PAGE = 25;

export type ProjectListSort = "custom" | "recent" | "name" | "unitsLeft";
export const PROJECT_SORTS: readonly ProjectListSort[] = ["custom", "recent", "name", "unitsLeft"];

/** What the "available units" column can honestly say. */
export type UnitTally =
  /** Per-unit rows exist, so the split is real. */
  | { kind: "counted"; available: number; reserved: number; sold: number; total: number }
  /** `totalUnits` is filled in but no ProjectUnit rows exist yet — the size
   *  is known, the availability genuinely is not. */
  | { kind: "notEntered"; total: number }
  /** Neither: a land plot or anything else not sold by the unit. */
  | { kind: "none" };

export type ProjectListRow = {
  id: string;
  slug: string;
  name: string;
  location: string;
  thumbnailUrl: string | null;
  propertyType: PropertyType;
  status: ProjectStatus;
  isPublished: boolean;
  contentStatus: ContentStatus;
  units: UnitTally;
  locales: { locale: string; fill: LocaleFill }[];
  /** True when at least one of the four locales has no content at all. */
  hasMissingLocale: boolean;
  updatedAt: Date;
  /** From AuditLog — null for rows never edited through the admin (seed
   *  data, imports), where `updatedAt` is all that is actually known. */
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
  progressCount: number;
};

export type ProjectListFilters = {
  search: string;
  propertyType: string;
  status: string;
  /** "ALL" | "PUBLISHED" | "DRAFT" — the site-visibility filter. */
  published: string;
  incompleteOnly: boolean;
  sort: ProjectListSort;
  page: number;
  perPage: number;
};

export type ProjectListResult = {
  rows: ProjectListRow[];
  /** Rows matching every active filter — the footer's "of N". */
  total: number;
  /** Rows matching everything *except* the language chip, so the chip can
   *  show what turning it on would find (same convention as the leads
   *  board's overdue chip). */
  incompleteCount: number;
  page: number;
  perPage: number;
  pageCount: number;
  truncated: boolean;
};

const EMPTY: ProjectListResult = {
  rows: [],
  total: 0,
  incompleteCount: 0,
  page: 1,
  perPage: DEFAULT_PER_PAGE,
  pageCount: 1,
  truncated: false,
};

function whereFrom(filters: ProjectListFilters): Prisma.ProjectWhereInput {
  const search = filters.search.trim();

  return {
    deletedAt: null,
    ...(filters.propertyType !== "ALL" &&
    (Object.values(PropertyType) as string[]).includes(filters.propertyType)
      ? { propertyType: filters.propertyType as PropertyType }
      : {}),
    ...(filters.status !== "ALL" &&
    (Object.values(ProjectStatus) as string[]).includes(filters.status)
      ? { status: filters.status as ProjectStatus }
      : {}),
    ...(filters.published === "PUBLISHED"
      ? { isPublished: true }
      : filters.published === "DRAFT"
        ? { isPublished: false }
        : {}),
    ...(search
      ? {
          OR: [
            { slug: { contains: search, mode: "insensitive" as const } },
            { location: { contains: search, mode: "insensitive" as const } },
            // The deprecated name columns are still what un-migrated rows
            // display from, so a search that ignored them would fail to
            // find a project the list is showing by that very name.
            { nameEn: { contains: search, mode: "insensitive" as const } },
            { nameTh: { contains: search, mode: "insensitive" as const } },
            {
              translations: {
                some: { name: { contains: search, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
  };
}

function tallyFor(
  counts: { available: number; reserved: number; sold: number } | undefined,
  totalUnits: number | null,
): UnitTally {
  if (counts) {
    const total = counts.available + counts.reserved + counts.sold;
    if (total > 0) return { kind: "counted", ...counts, total };
  }
  if (totalUnits && totalUnits > 0) return { kind: "notEntered", total: totalUnits };
  return { kind: "none" };
}

/** Available first, then the least-sold — a sort for "what can I still sell". */
function unitsLeftOf(units: UnitTally): number {
  return units.kind === "counted" ? units.available : -1;
}

export async function getAdminProjectList(
  locale: string,
  filters: ProjectListFilters,
): Promise<ProjectListResult> {
  return safeQuery(
    "admin:projects:list",
    async () => {
      const projects = await prisma.project.findMany({
        where: whereFrom(filters),
        // A stable base order; the real ordering is applied below, after
        // the translated name exists.
        orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
        take: MAX_ROWS,
        select: {
          id: true,
          slug: true,
          nameEn: true,
          nameTh: true,
          location: true,
          heroImageUrl: true,
          propertyType: true,
          status: true,
          isPublished: true,
          contentStatus: true,
          totalUnits: true,
          updatedAt: true,
          translations: {
            select: { locale: true, name: true, tagline: true, description: true },
          },
          _count: { select: { progressUpdates: true } },
        },
      });

      // One aggregate for every project in the filtered set — needed in
      // full (not just the visible page) because "units left" is a sort.
      const unitRows = await prisma.projectUnit.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: projects.map((project) => project.id) } },
        _count: { _all: true },
      });

      const unitCounts = new Map<string, { available: number; reserved: number; sold: number }>();
      for (const row of unitRows) {
        const entry = unitCounts.get(row.projectId) ?? { available: 0, reserved: 0, sold: 0 };
        if (row.status === "AVAILABLE") entry.available = row._count._all;
        if (row.status === "RESERVED") entry.reserved = row._count._all;
        if (row.status === "SOLD") entry.sold = row._count._all;
        unitCounts.set(row.projectId, entry);
      }

      const enriched = projects.map((project) => {
        const locales = localeFills(project.translations);
        return {
          project,
          name:
            getTranslation(project.translations, locale)?.name ??
            (locale === "th" ? project.nameTh : project.nameEn),
          locales,
          units: tallyFor(unitCounts.get(project.id), project.totalUnits),
          hasMissingLocale: locales.some((entry) => entry.fill === "missing"),
        };
      });

      const incompleteCount = enriched.filter((row) => row.hasMissingLocale).length;

      const filtered = filters.incompleteOnly
        ? enriched.filter((row) => row.hasMissingLocale)
        : enriched;

      const collator = new Intl.Collator(locale);
      const sorted = [...filtered].sort((a, b) => {
        switch (filters.sort) {
          case "recent":
            return b.project.updatedAt.getTime() - a.project.updatedAt.getTime();
          case "name":
            return collator.compare(a.name, b.name);
          case "unitsLeft":
            return unitsLeftOf(b.units) - unitsLeftOf(a.units);
          case "custom":
          default:
            // Already in sortOrder from the query; keep it stable.
            return 0;
        }
      });

      const total = sorted.length;
      const perPage = filters.perPage;
      const pageCount = Math.max(1, Math.ceil(total / perPage));
      const page = Math.min(Math.max(1, filters.page), pageCount);
      const visible = sorted.slice((page - 1) * perPage, page * perPage);

      // Last editor, one query for the page. `distinct` keeps the newest
      // entry per project because the ordering is applied first.
      const audits = visible.length
        ? await prisma.auditLog.findMany({
            where: {
              model: AUDIT_MODEL_NAME.PROJECT,
              recordId: { in: visible.map((row) => row.project.id) },
            },
            orderBy: { createdAt: "desc" },
            distinct: ["recordId"],
            select: {
              recordId: true,
              createdAt: true,
              actorEmail: true,
              actor: { select: { name: true } },
            },
          })
        : [];

      const auditByProject = new Map(audits.map((entry) => [entry.recordId, entry]));

      const rows: ProjectListRow[] = visible.map(({ project, name, locales, units, hasMissingLocale }) => {
        const audit = auditByProject.get(project.id);
        return {
          id: project.id,
          slug: project.slug,
          name,
          location: project.location,
          thumbnailUrl: project.heroImageUrl,
          propertyType: project.propertyType,
          status: project.status,
          isPublished: project.isPublished,
          contentStatus: project.contentStatus,
          units,
          locales,
          hasMissingLocale,
          updatedAt: project.updatedAt,
          // Name and time come from the same audit entry, or neither does:
          // pairing this project's `updatedAt` with an actor from an older
          // entry would state a time that person did not edit it.
          lastEditedBy: audit ? (audit.actor?.name ?? audit.actorEmail) : null,
          lastEditedAt: audit?.createdAt ?? null,
          progressCount: project._count.progressUpdates,
        };
      });

      return {
        rows,
        total,
        incompleteCount,
        page,
        perPage,
        pageCount,
        truncated: projects.length === MAX_ROWS,
      };
    },
    EMPTY,
  );
}
