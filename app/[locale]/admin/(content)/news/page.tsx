/**
 * app/[locale]/admin/news/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Article index (News.dc.html).
 *
 * The screen is built around one comparison: how many people read a piece,
 * and how many of them turned into somebody the sales team can call. See
 * lib/admin/news-list.ts for where both numbers come from and what they
 * deliberately do not count.
 *
 * "Scheduled" stays its own state, as it was before this rebuild — an
 * article published with a future date is invisible on the site, and a
 * plain "Published" badge would send an editor looking for a bug.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Info, Plus } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { isDatabaseOffline } from "@/lib/db";
import { intlLocale } from "@/lib/format";
import { LOCALE_DISPLAY_ORDER } from "@/i18n";
import {
  getNewsList,
  parseFilters,
  PER_PAGE_OPTIONS,
  VIEW_WINDOW_DAYS,
} from "@/lib/admin/news-list";
import NewsFilters from "@/components/admin/NewsFilters";
import NewsTable from "@/components/admin/NewsTable";
import TablePagination from "@/components/admin/TablePagination";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** "12 days ago", "1 month ago" — for drafts, which have no publish date
 *  and whose only useful timestamp is when somebody last touched them. */
function relativeDays(from: Date, locale: string): string {
  const days = Math.round((Date.now() - from.getTime()) / 86_400_000);
  const formatter = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });

  if (days < 30) return formatter.format(-days, "day");
  if (days < 365) return formatter.format(-Math.round(days / 30), "month");
  return formatter.format(-Math.round(days / 365), "year");
}

export default async function AdminNewsPage(props: Props) {
  const [{ locale }, searchParams] = await Promise.all([props.params, props.searchParams]);

  /* VIEWER may open the list to see what has been published; the "New"
     link and the table's bulk actions follow ./new/page.tsx's own EDITOR
     guard, which this does not change. */
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });

  const filters = parseFilters(searchParams);
  const view = await getNewsList(filters);

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  /*
    Dates and relative times are formatted here, where the locale and the
    values are both known, and handed to the table as strings. The table is
    a client component; formatting there would ship Intl work to the
    browser and risk a server/client mismatch on the relative times.
  */
  const rowMeta = Object.fromEntries(
    view.rows.map((row) => [
      row.id,
      {
        published: row.publishedAt ? dateFormat.format(new Date(row.publishedAt)) : null,
        edited: relativeDays(new Date(row.updatedAt), locale),
      },
    ]),
  );

  const first = view.total === 0 ? 0 : (view.page - 1) * filters.perPage + 1;
  const last = Math.min(view.page * filters.perPage, view.total);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="admin-section-title">{t("news.section")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{t("news.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("news.subtitle")}</p>
        </div>

        {/* Hidden below EDITOR because ./new/page.tsx guards at that
            minimum — the button follows the page, same reasoning as the
            projects and events "New" links. */}
        {canWrite && (
          <Link href={`/${locale}/admin/news/new`} className="admin-btn">
            <Plus size={16} aria-hidden />
            {t("news.new")}
          </Link>
        )}
      </header>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <NewsFilters
        locale={locale}
        activeSearch={filters.search}
        activeCategory={filters.category}
        activeStatus={filters.status}
        activeAuthor={filters.author}
        activeSort={filters.sort}
        incompleteOnly={filters.incompleteOnly}
        incompleteCount={view.incompleteCount}
        categories={view.categories}
        authors={view.authors}
        labels={{
          searchPlaceholder: t("news.searchPlaceholder"),
          category: t("news.category"),
          status: t("news.status"),
          author: t("news.author"),
          all: t("common.all"),
          everyone: t("news.everyone"),
          statusPublished: t("common.published"),
          statusInReview: t("news.statusInReview"),
          statusScheduled: t("news.scheduled"),
          statusDraft: t("common.draft"),
          incomplete: t("news.incompleteChip", { count: view.incompleteCount }),
          clearFilter: t("news.clearFilter"),
          sort: t("news.sort"),
          sortViews: t("news.sortViews"),
          sortLeads: t("news.sortLeads"),
          sortRecent: t("news.sortRecent"),
          sortTitle: t("news.sortTitle"),
        }}
      />

      <fieldset disabled={!canWrite} className="contents">
      <NewsTable
        locale={locale}
        rows={view.rows}
        /* Thai first, as everywhere else in this back office. */
        localeCodes={[...LOCALE_DISPLAY_ORDER]}
        rowMeta={rowMeta}
        labels={{
          selectAll: t("news.selectAll"),
          selectRow: t("news.selectRow"),
          article: t("news.articleTitle"),
          category: t("news.category"),
          author: t("news.author"),
          languages: t("news.languages"),
          status: t("news.status"),
          views: t("news.views", { days: VIEW_WINDOW_DAYS }),
          leads: t("news.leadsGenerated"),
          publishedAt: t("news.publishedAt"),
          edit: t("common.edit"),
          view: t("news.viewLive"),
          none: t("common.none"),
          noUrlYet: t("news.noUrlYet"),
          updatedPrefix: t("news.updatedPrefix"),
          reviewNote: t("news.reviewNote"),
          statusPublished: t("common.published"),
          statusInReview: t("news.statusInReview"),
          statusScheduled: t("news.scheduled"),
          statusDraft: t("common.draft"),
          empty: view.totalAll === 0 ? t("news.empty") : t("news.noMatches"),
          publish: t("news.bulkPublish"),
          unpublish: t("news.bulkUnpublish"),
          delete: t("common.delete"),
          clearSelection: t("news.clearSelection"),
          goToPublishing: t("news.goToPublishing"),
          error: t("common.error"),
        }}
      />
      </fieldset>

      <TablePagination
        basePath={`/${locale}/admin/news`}
        page={view.page}
        pageCount={view.pageCount}
        perPage={filters.perPage}
        /* The pagination strings are the project list's, verbatim — same
           control, same wording, one place to change it. */
        perPageOptions={PER_PAGE_OPTIONS.map((value) => ({
          value,
          label: t("projects.pagination.perPage", { count: value }),
        }))}
        labels={{
          /* The whole footer sentence, "showing 1–10 of 38 articles · 30
             published · 8 drafts", formatted here where every one of those
             numbers already exists. */
          showing: t("news.showing", {
            start: first,
            end: last,
            total: view.total,
            published: view.publishedCount,
            draft: view.draftCount,
          }),
          perPageAria: t("projects.pagination.perPageAria"),
          previous: t("projects.pagination.previous"),
          next: t("projects.pagination.next"),
          page: t("projects.pagination.page"),
        }}
      />

      {/* Where the two numbers come from, said once, near them. */}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          {t("news.metricsNote", { days: VIEW_WINDOW_DAYS })}
          {view.countingSince && (
            <>
              {" "}
              {t("news.countingSince", {
                date: dateFormat.format(new Date(view.countingSince)),
              })}
            </>
          )}
        </span>
      </p>
    </div>
  );
}
