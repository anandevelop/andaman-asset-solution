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

import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getMyAppointmentsToday } from "@/lib/appointments";
import { LeadSource, LeadStatus, Prisma, Role } from "@prisma/client";
import { isDatabaseOffline } from "@/lib/db";
import { requireCapability } from "@/lib/admin/guard";
import { can } from "@/lib/permissions";
import { intlLocale } from "@/lib/format";
import { maskPhone } from "@/lib/contact-mask";
import { ageParts } from "@/lib/admin/dashboard-model";
import { RESPONSE_SLA_HOURS } from "@/lib/dashboard-queue";
import { LEAD_STATUS_DOT } from "@/lib/admin/lead-status-tone";
import { isRangeDays, type RangeDays } from "@/lib/dashboard-range";
import {
  LEAD_BOARD_STATUSES,
  getLeadBoardData,
  getLeadBoardFilterOptions,
  getLeadTableRows,
  getOverdueCount,
  getScopedOpenLeadCount,
  getUnassignedCount,
  type LeadBoardFilters,
} from "@/lib/leads-board";
import LeadTable, { type LeadRowView } from "@/components/admin/LeadTable";
import PageTabs from "@/components/admin/PageTabs";
import LeadFilters from "@/components/admin/LeadFilters";
import LeadExportButton from "@/components/admin/LeadExportButton";
import LeadViewToggle from "@/components/admin/LeadViewToggle";
import LeadBoard, { type LeadBoardColumn } from "@/components/admin/LeadBoard";
import type { LeadCardView } from "@/components/admin/LeadBoardCard";
import LeadDrawer from "@/components/admin/LeadDrawer";
import LeadDetailView from "@/components/admin/LeadDetailView";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import { LEADS_VIEW_COOKIE, resolveLeadsView } from "@/lib/admin/leads-view";
import { Plus, Users } from "lucide-react";
import LeadCreateDrawer from "@/components/admin/LeadCreateDrawer";

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
    /** Free-text search — see whereFromFilters in lib/leads-board.ts. */
    q?: string;
    /** The lead open in the side drawer, if any — see LeadDrawer.tsx. */
    lead?: string;
    /** "1" opens the add-a-lead drawer — see LeadCreateDrawer.tsx. */
    new?: string;
  }>;
};

const PAGE_SIZE = 100;

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

  /* Rows open the lead in a drawer over this page rather than navigating
     away: the same URL plus ?lead=, so filters, view and scroll survive and
     Back closes it. The full page is still one click away inside it. */
  const listQuery = new URLSearchParams(
    Object.entries(searchParams).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[0] !== "lead" && entry[0] !== "new",
    ),
  ).toString();
  const leadHrefBase = `/${locale}/admin/leads?${listQuery ? `${listQuery}&` : ""}lead=`;
  const listHref = `/${locale}/admin/leads${listQuery ? `?${listQuery}` : ""}`;
  const newLeadHref = `/${locale}/admin/leads?${listQuery ? `${listQuery}&` : ""}new=1`;
  const openLeadId = parseId(searchParams.lead);

  const drawer = openLeadId ? (
    <LeadDrawer
      key={openLeadId}
      fullPageHref={`/${locale}/admin/leads/${openLeadId}`}
      labels={{
        close: t("leadDrawer.close"),
        openFullPage: t("leadDrawer.openFullPage"),
        dialog: t("leadDrawer.dialog"),
      }}
    >
      <Suspense
        fallback={<p className="px-5 py-10 text-center text-sm text-ink-muted">{t("leadDrawer.loading")}</p>}
      >
        <LeadDetailView locale={locale} id={openLeadId} variant="drawer" />
      </Suspense>
    </LeadDrawer>
  ) : null;

  /* Today's viewings, for the appointments tab's badge. The same figure
     lib/admin-nav-counts.ts computes for the sidebar — "mine, plus
     anything still unassigned" — but the layout's copy cannot reach a
     page, and one extra scoped query is cheaper than lifting the whole
     counts object through a context. */
  const appointmentsToday = (await getMyAppointmentsToday(session.id)).length;

  const view = resolveLeadsView(searchParams.view, (await cookies()).get(LEADS_VIEW_COOKIE)?.value);
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

  const query = searchParams.q?.trim() ?? "";

  const boardFilters: LeadBoardFilters = {
    assignedTo,
    projectId,
    source: source ?? undefined,
    rangeDays,
    overdueOnly,
    q: query || undefined,
  };

  const [filterOptions, overdueCount, unassignedCount, openLeadCount] = await Promise.all([
    getLeadBoardFilterOptions(),
    // The saved-view counts ignore the assignee and SLA filters they
    // themselves set, so "unassigned · 4" still says 4 while "mine" is on.
    getOverdueCount(session, { ...boardFilters, assignedTo: undefined, overdueOnly: false }),
    getUnassignedCount(session, { ...boardFilters, assignedTo: undefined, overdueOnly: false }),
    getScopedOpenLeadCount(session),
  ]);

  /* SALES may only give a lead to themselves (assignLead enforces it), so
     that is the only name its menus offer. */
  const assignableTo =
    session.role === Role.SALES ? [{ id: session.id, name: session.name }] : filterOptions.assignees;

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
      currentUserId={session.id}
      canPickAssignee={session.role !== Role.SALES}
      activeStatus={searchParams.status ?? "ALL"}
      activeSort={direction === "asc" ? "oldest" : "newest"}
      activeAssignee={assignedTo ?? searchParams.assignedTo ?? "ALL"}
      activeProject={projectId ?? "ALL"}
      activeSource={source ?? "ALL"}
      activeRange={rangeDays ?? "ALL"}
      activeQuery={query}
      overdueOnly={overdueOnly}
      overdueCount={overdueCount}
      unassignedCount={unassignedCount}
      statusLabels={statusLabels}
      sourceLabels={sourceLabels}
      assignees={filterOptions.assignees}
      projects={filterOptions.projects.map((project) => ({
        id: project.id,
        name: projectLabel(project) ?? project.nameEn,
      }))}
      labels={{
        views: t("leads.views.label"),
        viewAll: t("leads.views.all"),
        viewMine: t("leads.views.mine"),
        viewUnassigned: t("leads.views.unassigned"),
        viewSla: t("leads.views.sla"),
        search: t("leads.searchPlaceholder"),
        clearSearch: t("leads.clearSearch"),
        clearFilter: t("common.clearFilter"),
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
      }}
      trailing={
        <LeadViewToggle
          locale={locale}
          active={view}
          labels={{ group: t("leads.viewLabel"), board: t("leads.boardView"), table: t("leads.tableView") }}
        />
      }
    />
  );

  /* "+ เพิ่มลีด" — a lead taken by phone or at the show house. SALES own
     what they enter (createLead enforces it), so they get no assignee
     list; everyone else may hand it to a colleague. */
  const createDrawer =
    searchParams.new === "1" ? (
      <LeadCreateDrawer
        locale={locale}
        closeHref={listHref}
        leadHrefBase={leadHrefBase}
        projects={filterOptions.projects.map((project) => ({
          id: project.id,
          name: projectLabel(project) ?? project.nameEn,
        }))}
        assignees={session.role === Role.SALES ? null : filterOptions.assignees}
        currentUserId={session.id}
        sourceLabels={sourceLabels}
      />
    ) : null;

  const header = (
    <AdminPageHeader
      eyebrow={{ icon: Users, label: "CRM" }}
      title={t("nav.leads")}
      description={t("leads.headerDescription", { count: openLeadCount })}
      actions={
        <>
          {/* Carries the current status filter, so the file matches the
              table rather than always exporting everything. */}
          <LeadExportButton status={searchParams.status ?? "ALL"} />
          <Link href={newLeadHref} scroll={false} className="admin-btn">
            <Plus size={15} aria-hidden />
            {t("leads.create.button")}
          </Link>
        </>
      }
    />
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
      counts={{ pipeline: openLeadCount }}
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
      dotClassName: LEAD_STATUS_DOT[columnStatus],
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

        <LeadBoard
          locale={locale}
          columns={columns}
          leadHrefBase={leadHrefBase}
          errorLabel={t("common.error")}
        />
        {drawer}
        {createDrawer}
      </div>
    );
  }

  // ── Table view ──────────────────────────────────────────────────────
  const rows = await getLeadTableRows(session, boardFilters, { status, direction, take: PAGE_SIZE });
  const now = new Date();

  const rowViews: LeadRowView[] = rows.map((lead) => {
    const age = ageParts(lead.createdAt, now);
    return {
      id: lead.id,
      name: lead.name,
      // Masked here, on the server: the full number never reaches the
      // browser from a list. See lib/contact-mask.ts.
      maskedPhone: maskPhone(lead.phone),
      commsLanguage: lead.commsLanguage,
      projectName: projectLabel(lead.project),
      projectImage: lead.project?.imageUrl ?? null,
      sourceLabel: sourceLabels[lead.source],
      status: lead.status,
      assignee: lead.assignedTo,
      receivedIso: lead.createdAt.toISOString(),
      receivedLabel: dateFormat.format(lead.createdAt),
      ageLabel: t(`dashboard.inbox.age.${age.unit}`, { value: age.value }),
      late:
        lead.status === LeadStatus.NEW &&
        now.getTime() - lead.createdAt.getTime() >= RESPONSE_SLA_HOURS * 3_600_000,
      consentGiven: lead.consentGiven,
    };
  });

  return (
    <div className="space-y-5">
      {header}
      {tabs}
      {unassignedBanner}
      {filtersUi}
      {offlineNotice}

      <p className="text-sm text-ink-muted">{t("leads.count", { count: rows.length })}</p>

      {rows.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">{t("leads.empty")}</div>
      ) : (
        <LeadTable
          locale={locale}
          rows={rowViews}
          leadHrefBase={leadHrefBase}
          assignees={assignableTo}
          statusLabels={statusLabels}
          canExport={can(session.role, "exportCustomerData")}
          labels={{
            selectAll: t("leads.table.selectAll"),
            customer: t("leads.table.customer"),
            interest: t("leads.table.interest"),
            channel: t("leads.table.channel"),
            status: t("leads.status"),
            owner: t("leads.table.owner"),
            receivedAt: t("leads.table.receivedAt"),
            pdpaNote: t("leads.table.pdpaNote"),
            assign: t("leads.table.assign"),
            unassign: t("leads.unassigned"),
            noProject: t("leads.noProject"),
            noConsent: t("leads.table.noConsent"),
            bulkAssign: t("leads.bulk.assign"),
            bulkStatus: t("leads.bulk.status"),
            bulkExport: t("leads.bulk.export"),
            bulkClear: t("leads.bulk.clear"),
            unassigned: t("leads.table.unassignedDone"),
            failed: t("common.error"),
          }}
        />
      )}
      {drawer}
      {createDrawer}
    </div>
  );
}
