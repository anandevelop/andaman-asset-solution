/**
 * app/[locale]/admin/projects/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Project index (Projects.dc.html): search, filters, sorting, pagination,
 * bulk publish/hide/reorder/export, and the per-row facts a sales office
 * actually manages the catalogue by — how many units are still available,
 * how complete each of the four languages is, and who last touched it.
 *
 * Soft-deleted rows are excluded — they still exist for the benefit of old
 * URLs and lead attribution, but they are not editable here.
 *
 * The table is a client component so selection, drag order and the publish
 * switches can share one piece of state. Everything it renders is prepared
 * here: dates turned into relative phrases, enums translated, rows
 * serialised. It receives display strings, not Prisma models — Decimal and
 * Date do not cross that boundary.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { ProjectStatus, PropertyType, Role } from "@prisma/client";
import { isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { relativeTime } from "@/lib/relative-time";
import {
  DEFAULT_PER_PAGE,
  PER_PAGE_OPTIONS,
  PROJECT_SORTS,
  getAdminProjectList,
  type ProjectListSort,
} from "@/lib/admin/project-list";
import PageTabs from "@/components/admin/PageTabs";
import ProjectFilters from "@/components/admin/ProjectFilters";
import ProjectsTable, { type ProjectTableRow } from "@/components/admin/ProjectsTable";
import TablePagination from "@/components/admin/TablePagination";

type SearchParams = {
  q?: string;
  type?: string;
  status?: string;
  published?: string;
  incomplete?: string;
  sort?: string;
  page?: string;
  perPage?: string;
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function AdminProjectsPage(props: Props) {
  const [{ locale }, searchParams] = await Promise.all([props.params, props.searchParams]);

  // VIEWER may see the catalogue; canCreate (below) already excludes them
  // from "New", and the table's bulk actions are gated on canWrite.
  const session = await requireAdmin(locale, Role.VIEWER);
  // Matches ../new/page.tsx's own guard exactly — see the note by the
  // "New" button below.
  const canCreate = hasRole(session.role, Role.ADMIN);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const [t, tEnum] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "projects" }),
  ]);

  const sort: ProjectListSort = PROJECT_SORTS.includes(searchParams.sort as ProjectListSort)
    ? (searchParams.sort as ProjectListSort)
    : "custom";

  const perPage = PER_PAGE_OPTIONS.includes(
    parsePositiveInt(searchParams.perPage, DEFAULT_PER_PAGE) as (typeof PER_PAGE_OPTIONS)[number],
  )
    ? parsePositiveInt(searchParams.perPage, DEFAULT_PER_PAGE)
    : DEFAULT_PER_PAGE;

  const filters = {
    search: searchParams.q ?? "",
    propertyType: searchParams.type ?? "ALL",
    status: searchParams.status ?? "ALL",
    published: searchParams.published ?? "ALL",
    incompleteOnly: searchParams.incomplete === "true",
    sort,
    page: parsePositiveInt(searchParams.page, 1),
    perPage,
  };

  const list = await getAdminProjectList(locale, filters);
  const offline = isDatabaseOffline();
  const now = new Date();

  const typeLabels = Object.fromEntries(
    Object.values(PropertyType).map((value) => [value, tEnum(`propertyType.${value}` as never)]),
  ) as Record<PropertyType, string>;

  const statusLabels = Object.fromEntries(
    Object.values(ProjectStatus).map((value) => [value, tEnum(`status.${value}` as never)]),
  ) as Record<ProjectStatus, string>;

  const unitsLabelFor = (units: (typeof list.rows)[number]["units"]) => {
    if (units.kind === "counted") {
      return t("projects.columns.unitsCount", {
        available: units.available,
        total: units.total,
      });
    }
    return units.kind === "notEntered"
      ? t("projects.columns.unitsNotEntered")
      : t("projects.columns.unitsNone");
  };

  const rows: ProjectTableRow[] = list.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    location: row.location,
    thumbnailUrl: row.thumbnailUrl,
    typeLabel: typeLabels[row.propertyType],
    status: row.status,
    statusLabel: statusLabels[row.status],
    isPublished: row.isPublished,
    contentStatus: row.contentStatus,
    units: row.units,
    unitsLabel: unitsLabelFor(row.units),
    locales: row.locales,
    // The audit entry's own timestamp, so the time and the name below it
    // describe the same edit; `updatedAt` only stands in when nothing in
    // the trail names this row (seeded or imported data).
    lastEditedLabel: relativeTime(locale, row.lastEditedAt ?? row.updatedAt, now),
    lastEditedBy: row.lastEditedBy,
    progressCount: row.progressCount,
  }));

  const isFiltered =
    Boolean(filters.search.trim()) ||
    filters.propertyType !== "ALL" ||
    filters.status !== "ALL" ||
    filters.published !== "ALL" ||
    filters.incompleteOnly;

  /*
    Reordering writes sortOrder for a contiguous run of the list, so it is
    only offered on the list as it really is: no search, no filters, and
    the custom order itself. Under any other view the rows on screen are
    not adjacent in the stored order, and the positions between them belong
    to projects the admin cannot see.
  */
  const reorderable = !isFiltered && sort === "custom";

  const filterQuery = new URLSearchParams(
    Object.entries(searchParams).filter(([, value]) => Boolean(value)) as [string, string][],
  ).toString();

  const rangeStart = list.total === 0 ? 0 : (list.page - 1) * list.perPage + 1;
  const rangeEnd = Math.min(list.page * list.perPage, list.total);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="admin-section-title">{t("nav.projects")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
            {t("projects.title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t("projects.subtitle")}</p>
        </div>

        {/* Hidden below ADMIN because ../new/page.tsx guards at
            requireAdmin(locale, Role.ADMIN). The button follows the page,
            not the other way round: widening the page to match the button
            would hand every editor the ability to create developments, which is
            a permissions change, not a UI fix. */}
        {canCreate && (
          <Link href={`/${locale}/admin/projects/new`} className="admin-btn">
            <Plus size={16} aria-hidden />
            {t("projects.new")}
          </Link>
        )}
      </header>

      {/* The three cross-project lists. Progress and E-brochures used to be
          sidebar rows of their own; their per-project halves are tabs of
          the project workspace now, and this is where the "across every
          project" view they also held still lives. The base comes from the
          config (NavItem.tabsBase), not from here — see PageTabs. */}
      <PageTabs locale={locale} role={session.role} groupKey="projects" />

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <ProjectFilters
        locale={locale}
        activeSearch={filters.search}
        activeType={filters.propertyType}
        activeStatus={filters.status}
        activePublished={filters.published}
        activeSort={sort}
        incompleteOnly={filters.incompleteOnly}
        incompleteCount={list.incompleteCount}
        resultCount={list.total}
        typeLabels={typeLabels}
        statusLabels={statusLabels}
        labels={{
          searchPlaceholder: t("projects.filters.searchPlaceholder"),
          resultCount: t("projects.filters.resultCount", { count: list.total }),
          // Short forms, not the edit form's own field labels — "Property
          // type: All" does not fit a filter chip in Thai.
          type: t("projects.filters.type"),
          status: t("projects.filters.status"),
          published: t("projects.filters.published"),
          all: t("common.all"),
          publishedOnly: t("common.published"),
          draftOnly: t("common.draft"),
          incomplete: t("projects.filters.incomplete"),
          sort: t("projects.filters.sort"),
          sortCustom: t("projects.filters.sortCustom"),
          sortRecent: t("projects.filters.sortRecent"),
          sortName: t("projects.filters.sortName"),
          sortUnitsLeft: t("projects.filters.sortUnitsLeft"),
        }}
      />

      {list.truncated && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("projects.filters.truncated")}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {/* "Nothing matches" and "nothing exists yet" are different
              problems, and only one of them is solved by clearing a
              filter. */}
          {isFiltered ? t("projects.noMatches") : t("projects.empty")}
        </div>
      ) : (
        <>
          <fieldset disabled={!canWrite} className="contents">
          <ProjectsTable
            locale={locale}
            rows={rows}
            startIndex={(list.page - 1) * list.perPage}
            reorderable={reorderable}
            filterQuery={filterQuery}
            labels={{
              columnProject: t("projects.name"),
              columnLocation: t("projects.location"),
              columnType: t("projects.propertyType"),
              columnStatus: t("projects.columns.projectStatus"),
              columnUnits: t("projects.columns.unitsAvailable"),
              columnLanguages: t("projects.columns.languages"),
              // "Visibility", not common.published ("Published") — the
              // column holds a switch you set, not a state it reports.
              columnPublished: t("projects.filters.published"),
              columnUpdated: t("projects.columns.lastEdited"),
              selectAll: t("projects.bulk.selectAll"),
              selectRow: t("projects.bulk.selectRow"),
              publish: t("projects.bulk.publish"),
              unpublish: t("projects.bulk.hide"),
              reorder: t("projects.bulk.reorder"),
              reorderDone: t("projects.bulk.reorderDone"),
              reorderHint: t("projects.bulk.reorderHint"),
              reorderUnavailable: t("projects.bulk.reorderUnavailable"),
              dragRow: t("projects.bulk.dragRow"),
              exportCsv: t("projects.bulk.exportCsv"),
              clear: t("projects.bulk.clear"),
              edit: t("common.edit"),
              progress: t("projects.manageProgress"),
              draftBadge: t("publishing.table.statusDraft"),
              reviewBadge: t("publishing.table.statusReview"),
              awaitingReview: t("projects.columns.awaitingReview"),
              publishBlocked: t("projects.bulk.publishBlocked"),
              noImage: t("projects.columns.noImage"),
              done: t("projects.bulk.done"),
              error: t("common.error"),
              exportFailed: t("common.error"),
            }}
          />
          </fieldset>

          <TablePagination
            basePath={`/${locale}/admin/projects`}
            page={list.page}
            pageCount={list.pageCount}
            perPage={list.perPage}
            perPageOptions={PER_PAGE_OPTIONS.map((value) => ({
              value,
              label: t("projects.pagination.perPage", { count: value }),
            }))}
            labels={{
              showing: t("projects.pagination.showing", {
                start: rangeStart,
                end: rangeEnd,
                total: list.total,
              }),
              perPageAria: t("projects.pagination.perPageAria"),
              previous: t("projects.pagination.previous"),
              next: t("projects.pagination.next"),
              page: t("projects.pagination.page"),
            }}
          />
        </>
      )}
    </div>
  );
}
