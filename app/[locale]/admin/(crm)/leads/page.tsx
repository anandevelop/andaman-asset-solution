/**
 * app/[locale]/admin/leads/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The lead pipeline, in two views (LeadBoard.dc.html) — a Kanban board,
 * the default, and the pre-existing table, both reading the same filters
 * from the URL (see LeadFilters.tsx) so a bookmarked or shared link opens
 * to the same slice of the pipeline in either view.
 *
 * SALES-role scoping: a SALES session only ever sees leads that are
 * unassigned or assigned to them — never the whole pipeline. EDITOR and
 * above still see everything, matching how this page worked before SALES
 * existed. See leads/actions.ts's file header for the matching write-side
 * scoping, and lib/leads-board.ts for where both views apply it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getMyAppointmentsToday } from "@/lib/appointments";
import { LeadSource, LeadStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireCapability } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";
import { nationalityLabel } from "@/lib/countries";
import type { Locale } from "@/i18n";
import { isRangeDays, type RangeDays } from "@/lib/dashboard-range";
import {
  LEAD_BOARD_STATUSES,
  getLeadBoardData,
  getLeadBoardFilterOptions,
  getOverdueCount,
  type LeadBoardFilters,
} from "@/lib/leads-board";
import LeadStatusSelect from "@/components/admin/LeadStatusSelect";
import LeadAssignSelect from "@/components/admin/LeadAssignSelect";
import LeadFollowUpInput from "@/components/admin/LeadFollowUpInput";
import PageTabs from "@/components/admin/PageTabs";
import LeadFilters from "@/components/admin/LeadFilters";
import LeadExportButton from "@/components/admin/LeadExportButton";
import LeadViewToggle from "@/components/admin/LeadViewToggle";
import LeadBoard, { type LeadBoardColumn } from "@/components/admin/LeadBoard";
import type { LeadCardView } from "@/components/admin/LeadBoardCard";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    view?: string;
    status?: string;
    sort?: string;
    assignedTo?: string;
    project?: string;
    source?: string;
    range?: string;
    overdue?: string;
  }>;
};

const PAGE_SIZE = 100;

/** A column dot colour per status — the board's at-a-glance stage cue,
 *  the same job LeadStatusSelect's TONE map does for the table's select. */
const COLUMN_DOT: Record<(typeof LEAD_BOARD_STATUSES)[number], string> = {
  NEW: "bg-accent",
  CONTACTED: "bg-sky-500",
  QUALIFIED: "bg-blue-600",
  VIEWING_SCHEDULED: "bg-emerald-600",
  NEGOTIATING: "bg-orange-500",
  WON: "bg-primary",
};

function parseStatus(value: string | undefined): LeadStatus | null {
  if (!value || value === "ALL") return null;
  return (Object.values(LeadStatus) as string[]).includes(value)
    ? (value as LeadStatus)
    : null;
}

function parseSource(value: string | undefined): LeadSource | null {
  if (!value || value === "ALL") return null;
  return (Object.values(LeadSource) as string[]).includes(value)
    ? (value as LeadSource)
    : null;
}

function parseId(value: string | undefined): string | undefined {
  return value && value !== "ALL" ? value : undefined;
}

/** "YYYY-MM-DD" in UTC, for the plain <input type="date"> follow-up field. */
function toDateInputValue(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export default async function AdminLeadsPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const { locale } = params;

  /* Capability, not rank: EDITOR outranks SALES, so the old
     requireAdmin(locale, Role.SALES) here let every content editor read
     every customer's name, phone and email. See lib/permissions.ts. */
  const session = await requireCapability(locale, "viewAllLeads");

  const t = await getTranslations({ locale, namespace: "admin" });

  /* Today's viewings, for the appointments tab's badge. The same figure
     lib/admin-nav-counts.ts computes for the sidebar — "mine, plus
     anything still unassigned" — but the layout's copy cannot reach a
     page, and one extra scoped query is cheaper than lifting the whole
     counts object through a context. */
  const appointmentsToday = (await getMyAppointmentsToday(session.id)).length;

  const view = searchParams.view === "table" ? "table" : "board";
  const status = parseStatus(searchParams.status);
  const direction: Prisma.SortOrder = searchParams.sort === "oldest" ? "asc" : "desc";
  const source = parseSource(searchParams.source);
  const projectId = parseId(searchParams.project);
  // The board's own implicit default is the last 90 days (LeadBoard.dc.html
  // shows it pre-selected), not "every lead ever" — the table keeps no
  // limit as its default since there's no mockup evidence either way for
  // it. Choosing "every lead" on the board writes range=ALL explicitly
  // (see LeadFilters.tsx's setParam) rather than relying on absence, since
  // absence now means something else.
  const rangeDays: RangeDays | undefined =
    searchParams.range === "ALL"
      ? undefined
      : isRangeDays(searchParams.range)
        ? searchParams.range
        : view === "board"
          ? "90"
          : undefined;
  const overdueOnly = searchParams.overdue === "true";

  // Linked from the dashboard's "new leads with no owner" work-queue card
  // ("assign all") — narrows to the unassigned pool without needing its
  // own status value, since unassigned spans every open status.
  const assignedToUnassigned = searchParams.assignedTo === "unassigned";
  const assignedTo = parseId(searchParams.assignedTo);

  const boardFilters: LeadBoardFilters = {
    assignedTo,
    projectId,
    source: source ?? undefined,
    rangeDays,
    overdueOnly,
  };

  const [filterOptions, overdueCount] = await Promise.all([
    getLeadBoardFilterOptions(),
    getOverdueCount(session, boardFilters),
  ]);

  const offline = isDatabaseOffline();

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const shortDateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
  });
  const timeFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusLabels = Object.fromEntries(
    Object.values(LeadStatus).map((value) => [value, t(`leadStatus.${value}` as never)]),
  ) as Record<LeadStatus, string>;
  const sourceLabels = Object.fromEntries(
    Object.values(LeadSource).map((value) => [value, t(`leadSource.${value}` as never)]),
  ) as Record<LeadSource, string>;
  const projectLabel = (project: { nameEn: string; nameTh: string } | null) =>
    project ? (locale === "th" ? project.nameTh : project.nameEn) : null;

  const filtersUi = (
    <LeadFilters
      locale={locale}
      view={view}
      activeStatus={searchParams.status ?? "ALL"}
      activeSort={direction === "asc" ? "oldest" : "newest"}
      activeAssignee={assignedTo ?? searchParams.assignedTo ?? "ALL"}
      activeProject={projectId ?? "ALL"}
      activeSource={source ?? "ALL"}
      activeRange={rangeDays ?? "ALL"}
      overdueOnly={overdueOnly}
      overdueCount={overdueCount}
      statusLabels={statusLabels}
      sourceLabels={sourceLabels}
      assignees={filterOptions.assignees}
      projects={filterOptions.projects.map((project) => ({
        id: project.id,
        name: projectLabel(project) ?? project.nameEn,
      }))}
      labels={{
        status: t("leads.filterStatus"),
        sort: t("leads.sort"),
        all: t("common.all"),
        newest: t("leads.sortNewest"),
        oldest: t("leads.sortOldest"),
        assignee: t("leads.filterAssignee"),
        assigneeAll: t("leads.filterAssigneeAll"),
        project: t("leads.filterProject"),
        source: t("leads.filterSource"),
        range: t("leads.filterRange"),
        range7: t("dashboard.range7"),
        range30: t("dashboard.range30"),
        range90: t("dashboard.range90"),
        range365: t("dashboard.range365"),
        overdueOnly: t("leads.overdueOnly"),
      }}
    />
  );

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="admin-section-title">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("leads.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t("leads.subtitle")}</p>
      </div>

      <div className="flex items-center gap-2.5">
        <LeadViewToggle
          locale={locale}
          active={view}
          labels={{ board: t("leads.boardView"), table: t("leads.tableView") }}
        />
        {/* Carries the current status filter, so the file matches the
            table rather than always exporting everything. */}
        <LeadExportButton status={searchParams.status ?? "ALL"} />
      </div>
    </header>
  );

  /* The same strip the appointments calendar draws — see
     NAV_TAB_GROUPS.leads for why an appointment is a view of this page
     rather than a menu row beside it. The badge is today's viewings,
     which used to be a sidebar badge on the row that has gone. */
  const tabs = (
    <PageTabs
      locale={locale}
      role={session.role}
      groupKey="leads"
      badges={{ appointments: appointmentsToday }}
      carryParams={["project", "assignedTo"]}
    />
  );

  const offlineNotice = offline && (
    <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {t("common.offline")}
    </p>
  );

  const unassignedBanner = assignedToUnassigned && (
    <p className="flex flex-wrap items-center gap-2 rounded-xs border border-accent/30 bg-accent-50/60 px-4 py-3 text-sm text-primary">
      {t("leads.unassignedOnlyFilter")}
      <Link
        href={`/${locale}/admin/leads${status ? `?status=${status}` : ""}`}
        className="text-accent-700 underline hover:text-accent-800"
      >
        {t("common.all")}
      </Link>
    </p>
  );

  if (view === "board") {
    const board = await getLeadBoardData(session, boardFilters);
    const now = new Date();

    const columns: LeadBoardColumn[] = LEAD_BOARD_STATUSES.map((columnStatus) => ({
      status: columnStatus,
      label: statusLabels[columnStatus],
      dotClassName: COLUMN_DOT[columnStatus],
      cards: board.columns[columnStatus].map((lead): LeadCardView => {
        let ageLabel: string;
        let ageTone: LeadCardView["ageTone"] = lead.isUrgent ? "urgent" : "default";
        let hintLine: string;
        let hintTone: LeadCardView["hintTone"] = "muted";

        if (columnStatus === LeadStatus.VIEWING_SCHEDULED && lead.nextAppointmentAt) {
          const appt = lead.nextAppointmentAt;
          const isToday = isSameUtcDay(appt, now);
          const isTomorrow = isSameUtcDay(appt, new Date(now.getTime() + 24 * 60 * 60_000));
          const relative = isToday
            ? t("appointments.today")
            : isTomorrow
              ? t("leads.tomorrow")
              : shortDateFormat.format(appt);

          ageLabel = relative;
          ageTone = "default";
          hintTone = isToday ? "today" : "muted";
          hintLine = lead.assignedTo
            ? t("leads.board.appointmentWith", {
                when: relative,
                time: timeFormat.format(appt),
                name: lead.assignedTo.name,
              })
            : `${relative} ${timeFormat.format(appt)}`;
        } else if (columnStatus === LeadStatus.WON) {
          ageLabel = shortDateFormat.format(lead.updatedAt);
          hintLine = lead.latestNoteBody ?? sourceLabels[lead.source];
        } else if (columnStatus === LeadStatus.NEW) {
          const hours = Math.max(0, Math.round((now.getTime() - lead.createdAt.getTime()) / 3_600_000));
          ageLabel = t("leads.hoursAgo", { hours });

          if (!lead.assignedTo) {
            hintLine = t("leads.board.unassigned");
            hintTone = "urgent";
          } else if (lead.latestNoteBody) {
            hintLine = lead.latestNoteBody;
          } else {
            hintLine = sourceLabels[lead.source];
          }
        } else {
          const days = Math.max(0, Math.floor((now.getTime() - lead.updatedAt.getTime()) / 86_400_000));
          ageLabel = t("leads.daysAgo", { days });

          if (!lead.assignedTo) {
            hintLine = t("leads.board.unassigned");
            hintTone = "urgent";
          } else if (lead.isUrgent) {
            hintLine = t("leads.board.noFollowUp", { days });
            hintTone = "urgent";
          } else if (lead.latestNoteBody) {
            hintLine = lead.latestNoteBody;
          } else if (lead.followUpAt && lead.followUpAt.getTime() > now.getTime()) {
            hintLine = t("leads.board.followUpOn", { date: dateFormat.format(lead.followUpAt) });
            hintTone = "followUp";
          } else {
            hintLine = sourceLabels[lead.source];
          }
        }

        return {
          id: lead.id,
          name: lead.name,
          projectLabel: projectLabel(lead.project),
          ageLabel,
          ageTone,
          hintLine,
          hintTone,
          assigneeName: lead.assignedTo?.name ?? null,
          consentGiven: lead.consentGiven,
        };
      }),
    }));

    return (
      <div className="space-y-6">
        {header}
        {tabs}
        {unassignedBanner}
        {filtersUi}
        {offlineNotice}

        <p className="text-sm text-ink-muted">
          {t("leads.openCount", { count: board.openCount })}
          {board.lostCount > 0 && ` · ${t("leads.lostCount", { count: board.lostCount })}`}
        </p>

        <LeadBoard locale={locale} columns={columns} errorLabel={t("common.error")} />
      </div>
    );
  }

  // ── Table view ──────────────────────────────────────────────────────
  const scopeWhere: Prisma.LeadInquiryWhereInput | undefined =
    session.role === Role.SALES
      ? { OR: [{ assignedToId: null }, { assignedToId: session.id }] }
      : undefined;

  const assignedToWhere: Prisma.LeadInquiryWhereInput | undefined = assignedTo
    ? { assignedToId: assignedTo === "unassigned" ? null : assignedTo }
    : undefined;

  const rangeWhere: Prisma.LeadInquiryWhereInput | undefined = rangeDays
    ? { createdAt: { gte: new Date(Date.now() - Number(rangeDays) * 24 * 60 * 60_000) } }
    : undefined;

  const overdueWhere: Prisma.LeadInquiryWhereInput | undefined = overdueOnly
    ? { status: LeadStatus.NEW, createdAt: { lte: new Date(Date.now() - 24 * 60 * 60_000) } }
    : undefined;

  const leads = await safeQuery(
    "admin:leads",
    () =>
      prisma.leadInquiry.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(source ? { source } : {}),
          ...(projectId ? { projectId } : {}),
          ...scopeWhere,
          ...assignedToWhere,
          ...rangeWhere,
          ...overdueWhere,
        },
        orderBy: { createdAt: direction },
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          nationality: true,
          message: true,
          source: true,
          status: true,
          consentGiven: true,
          createdAt: true,
          assignedToId: true,
          followUpAt: true,
          assignedTo: { select: { id: true, name: true } },
          project: { select: { slug: true, nameEn: true, nameTh: true } },
          _count: { select: { notes: true } },
        },
      }),
    [],
  );

  return (
    <div className="space-y-8">
      {header}
      {tabs}
      {unassignedBanner}
      {filtersUi}
      {offlineNotice}

      <p className="text-sm text-ink-muted">{t("leads.count", { count: leads.length })}</p>

      {leads.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">{t("leads.empty")}</div>
      ) : (
        <div className="overflow-x-auto rounded-xs border border-primary/10 bg-surface-raised shadow-card">
          <table className="w-full min-w-[1180px] border-collapse">
            <thead className="border-b border-primary/10 bg-surface-muted">
              <tr>
                <th className="admin-th">{t("leads.name")}</th>
                <th className="admin-th">{t("leads.contact")}</th>
                <th className="admin-th">{t("leads.project")}</th>
                <th className="admin-th">{t("leads.source")}</th>
                <th className="admin-th">{t("leads.received")}</th>
                <th className="admin-th">{t("leads.status")}</th>
                <th className="admin-th">{t("leads.assignedTo")}</th>
                <th className="admin-th">{t("leads.followUp")}</th>
                <th className="admin-th" />
              </tr>
            </thead>

            <tbody className="divide-y divide-primary/5">
              {leads.map((lead) => (
                <tr key={lead.id} className="transition-colors hover:bg-surface-muted/60">
                  <td className="admin-td">
                    <Link
                      href={`/${locale}/admin/leads/${lead.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {lead.name}
                    </Link>
                    {(() => {
                      const nationality = nationalityLabel(lead.nationality, locale as Locale);
                      return (
                        nationality && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                            {nationality.flagSrc && (
                              // eslint-disable-next-line @next/next/no-img-element -- tiny flag sprite, see CountrySelect.tsx
                              <img
                                src={nationality.flagSrc}
                                alt=""
                                aria-hidden
                                className="h-3 w-4 shrink-0 rounded-[1px] object-cover"
                              />
                            )}
                            {nationality.label}
                          </p>
                        )
                      );
                    })()}
                    {lead.message && (
                      <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-muted line-clamp-2">
                        {lead.message}
                      </p>
                    )}
                    {!lead.consentGiven && (
                      <p className="mt-1 text-xs font-medium text-red-700">
                        {t("leads.consent")}: {t("common.no")}
                      </p>
                    )}
                  </td>

                  <td className="admin-td whitespace-nowrap">
                    <a
                      href={`mailto:${lead.email}`}
                      className="block text-accent-700 hover:underline"
                    >
                      {lead.email}
                    </a>
                    <a
                      href={`tel:${lead.phone}`}
                      className="mt-0.5 block text-xs text-ink-muted hover:underline"
                    >
                      {lead.phone}
                    </a>
                  </td>

                  <td className="admin-td">
                    {lead.project ? (
                      projectLabel(lead.project)
                    ) : (
                      <span className="text-ink-muted">{t("leads.noProject")}</span>
                    )}
                  </td>

                  <td className="admin-td whitespace-nowrap text-ink-muted">
                    {sourceLabels[lead.source]}
                  </td>

                  <td className="admin-td whitespace-nowrap text-ink-muted">
                    <time dateTime={lead.createdAt.toISOString()}>
                      {dateFormat.format(lead.createdAt)}
                    </time>
                  </td>

                  <td className="admin-td">
                    <LeadStatusSelect
                      locale={locale}
                      leadId={lead.id}
                      value={lead.status}
                      labels={statusLabels}
                      errorLabel={t("common.error")}
                    />
                  </td>

                  <td className="admin-td">
                    <LeadAssignSelect
                      locale={locale}
                      leadId={lead.id}
                      value={lead.assignedToId}
                      assignees={filterOptions.assignees}
                      unassignedLabel={t("leads.unassigned")}
                      errorLabel={t("common.error")}
                    />
                  </td>

                  <td className="admin-td">
                    <LeadFollowUpInput
                      locale={locale}
                      leadId={lead.id}
                      value={toDateInputValue(lead.followUpAt)}
                      overdueLabel={t("leads.followUpOverdue")}
                      errorLabel={t("common.error")}
                    />
                  </td>

                  <td className="admin-td whitespace-nowrap">
                    <Link
                      href={`/${locale}/admin/leads/${lead.id}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {t("leads.viewDetail")}
                      {lead._count.notes > 0 ? ` (${lead._count.notes})` : ""}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
