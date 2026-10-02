/**
 * app/[locale]/admin/(crm)/appointments/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The appointments calendar — a week-by-week agenda (see lib/appointments.ts
 * for why this is a day-by-day list rather than an absolute-time grid),
 * an unassigned queue that is never allowed to hide, today's rundown, and
 * this week's per-rep workload.
 *
 * A tab of Leads rather than a menu row of its own: an appointment is a
 * lead's next step, and LeadActivityComposer already books one from inside
 * a lead. The URL has not changed — see NAV_TAB_GROUPS.leads.
 *
 * `?project=` and `?assignedTo=` are the leads table's own filter
 * parameters, honoured here so that narrowing to one project and then
 * switching tab does not quietly widen back out to the whole company.
 * They filter the week grid and today's rundown, and deliberately NOT the
 * unassigned queue or the team workload: the queue exists to be the one
 * thing on this page a filter cannot hide, and a per-rep workload chart
 * filtered to one rep is a chart of one bar.
 *
 * SALES and above — the same floor as the leads pipeline, since booking a
 * viewing is the next step after a lead, and the whole team needs to see
 * the shared calendar to avoid double-booking a slot. Row-level write
 * scoping (a SALES rep can only touch their own or unassigned rows) lives
 * in actions.ts, not here — every appointment on the page is visible to
 * everyone, only the write actions are restricted.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertCircle, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { AppointmentStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireCapability } from "@/lib/admin/guard";
import { intlLocale, toDateTimeLocal } from "@/lib/format";
import { maskPhone } from "@/lib/contact-mask";
import { canSeeItem } from "@/lib/admin/nav";
import { getOverdueAppointments } from "@/lib/admin/dashboard";
import { ageParts, type InboxItem } from "@/lib/admin/dashboard-model";
import { addMonths, dayKey as monthDayKey, monthGrid, parseMonthParam, toMonthParam } from "@/lib/admin/month-grid";
import {
  type AppointmentCard,
  getAppointmentsBetween,
  getEventsBetween,
  getTeamWorkload,
  getUnassignedAppointments,
  getWeekAppointments,
  parseWeekParam,
  toWeekParam,
  weekDays,
} from "@/lib/appointments";
import AppointmentAssignSelect from "@/components/admin/AppointmentAssignSelect";
import AppointmentStatusSelect from "@/components/admin/AppointmentStatusSelect";
import AppointmentRescheduleInput from "@/components/admin/AppointmentRescheduleInput";
import AppointmentCreateForm from "@/components/admin/AppointmentCreateForm";
import PageTabs from "@/components/admin/PageTabs";
import WorkInbox from "@/components/admin/WorkInbox";
import { getScopedOpenLeadCount } from "@/lib/leads-board";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import Segmented from "@/components/admin/ui/Segmented";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; month?: string; week?: string; project?: string; assignedTo?: string }>;
};

const DAY_MS = 24 * 60 * 60_000;
const LIST_DAYS = 30;

const STATUS_BORDER: Record<AppointmentStatus, string> = {
  REQUESTED: "border-adm-warning/30 bg-adm-warning-bg",
  CONFIRMED: "border-adm-success/30 bg-adm-success-bg",
  COMPLETED: "border-adm-line-strong bg-adm-text/4",
  CANCELLED: "border-adm-line bg-adm-solid opacity-60",
  NO_SHOW: "border-adm-danger/30 bg-adm-danger-bg",
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A month-view chip per appointment status, from the status tokens. */
const CHIP_TONE: Record<AppointmentStatus, string> = {
  REQUESTED: "bg-adm-warning-bg text-adm-warning",
  CONFIRMED: "bg-adm-success-bg text-adm-success",
  COMPLETED: "bg-adm-neutral-bg text-adm-neutral",
  CANCELLED: "bg-adm-neutral-bg text-adm-neutral line-through",
  NO_SHOW: "bg-adm-danger-bg text-adm-danger",
};

/** A chip is a link only where the viewer may open what it points at. */
function MaybeLink({ href, className, children }: { href: string | null; className: string; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className={`${className} block hover:opacity-80`}>
      {children}
    </Link>
  ) : (
    <span className={`${className} block`}>{children}</span>
  );
}

export default async function AdminAppointmentsPage(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { locale } = params;

  /* Capability, not rank: EDITOR outranks SALES, so the old
     requireAdmin(locale, Role.SALES) here let every content editor read
     every customer's name, phone and email. See lib/permissions.ts. */
  const session = await requireCapability(locale, "viewAllLeads");
  const openLeadCount = await getScopedOpenLeadCount(session);

  /* Month first (the v4 calendar), week on request — the week agenda is
     where appointments are edited in place, so it stays one click away
     rather than being replaced. */
  const view = searchParams.view === "week" ? "week" : searchParams.view === "list" ? "list" : "month";
  /* The list view: everything from today for the next LIST_DAYS days, in
     time order — the "what is coming" question the two grids answer only
     one screen at a time. */
  const listFrom = new Date(new Date().setUTCHours(0, 0, 0, 0));
  const listTo = new Date(listFrom.getTime() + LIST_DAYS * DAY_MS);
  const monthStart = parseMonthParam(searchParams.month);
  const weeks = monthGrid(monthStart);
  const gridFrom = weeks[0][0].date;
  const gridTo = new Date(weeks.at(-1)![6].date.getTime() + DAY_MS);

  const weekStart = parseWeekParam(searchParams.week);
  const days = weekDays(weekStart);
  const prevWeek = toWeekParam(new Date(weekStart.getTime() - 7 * DAY_MS));
  const nextWeek = toWeekParam(new Date(weekStart.getTime() + 7 * DAY_MS));
  const thisWeek = toWeekParam(new Date());

  const [tRoot, t, tStatus, weekAppointments, unassigned, workload, recentLeads, projects, overdue, monthAppointments, monthEvents, listAppointments] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "admin.appointments" }),
    getTranslations({ locale, namespace: "admin.appointmentStatus" }),
    getWeekAppointments(weekStart),
    getUnassignedAppointments(),
    getTeamWorkload(weekStart),
    safeQuery(
      "admin:appointments:recentLeads",
      () =>
        prisma.leadInquiry.findMany({
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { id: true, name: true, phone: true },
        }),
      [],
    ),
    safeQuery(
      "admin:appointments:projects",
      () =>
        prisma.project.findMany({
          where: { deletedAt: null },
          orderBy: { nameEn: "asc" },
          select: { id: true, nameEn: true, nameTh: true },
        }),
      [],
    ),
    getOverdueAppointments(session),
    view === "month" ? getAppointmentsBetween(gridFrom, gridTo) : Promise.resolve([]),
    view === "month" ? getEventsBetween(gridFrom, gridTo) : Promise.resolve([]),
    view === "list" ? getAppointmentsBetween(listFrom, listTo) : Promise.resolve([]),
  ]);

  const offline = isDatabaseOffline();

  /* Filtered in memory, not in the query: getWeekAppointments already
     fetched exactly one week, which is tens of rows, and pushing these
     two into lib/appointments.ts would give that module a second, nearly
     identical fetch for one caller. "unassigned" means the same thing it
     means on the leads table — assignedToId is null. */
  const filterProject = searchParams.project?.trim() || null;
  const filterAssignee = searchParams.assignedTo?.trim() || null;

  const matchesFilters = (a: AppointmentCard) =>
    (!filterProject || a.projectId === filterProject) &&
    (!filterAssignee ||
      (filterAssignee === "unassigned" ? a.assignedToId === null : a.assignedToId === filterAssignee));

  const visibleAppointments = weekAppointments.filter(matchesFilters);
  const filtered = visibleAppointments.length !== weekAppointments.length;

  const byDay = new Map<string, AppointmentCard[]>();
  for (const a of visibleAppointments) {
    const key = dayKey(a.scheduledAt);
    byDay.set(key, [...(byDay.get(key) ?? []), a]);
  }

  const todayKey = dayKey(new Date());
  const todayAppointments = (byDay.get(todayKey) ?? []).slice().sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
  );

  const statusLabels = Object.fromEntries(
    Object.values(AppointmentStatus).map((s) => [s, tStatus(s)]),
  ) as Record<AppointmentStatus, string>;

  const timeFmt = new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit" });
  const dayFmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short" });
  const dateRangeFmt = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" });
  const yearFmt = new Intl.DateTimeFormat(intlLocale(locale), { year: "numeric" });

  const weekEndDisplay = new Date(weekStart.getTime() + 6 * DAY_MS);
  const weekLabel = `${dateRangeFmt.format(weekStart)} – ${dateRangeFmt.format(weekEndDisplay)} ${yearFmt.format(weekEndDisplay)}`;

  const canAssignOthers = session.role !== Role.SALES;
  const assigneeOptions = workload.map((w) => ({ id: w.id, name: w.name }));
  const assigneeSelectOptions = workload.map((w) => ({ id: w.id, label: w.name }));

  // ── "ต้องจัดการ": REQUESTED and already past ─────────────────────────
  const now = new Date();
  const dueFmt = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const needsAction: InboxItem[] = overdue.rows.map((row) => {
    const age = ageParts(row.scheduledAt, now);
    return {
      key: `appointment:${row.id}`,
      kind: "appointment",
      id: row.id,
      title: row.lead?.name ?? t("noLeadLinked"),
      detail: [
        dueFmt.format(row.scheduledAt),
        row.project ? (locale === "th" ? row.project.nameTh : row.project.nameEn) : null,
      ]
        .filter(Boolean)
        .join(" · "),
      since: row.scheduledAt.toISOString(),
      ageLabel: tRoot(`dashboard.inbox.age.${age.unit}`, { value: age.value }),
      late: true,
      href: null,
    };
  });

  // ── List ───────────────────────────────────────────────────────────────
  const listByDay = [...listAppointments.filter(matchesFilters)]
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    .reduce<[string, AppointmentCard[]][]>((groups, appointment) => {
      const key = dayKey(appointment.scheduledAt);
      const last = groups.at(-1);
      if (last && last[0] === key) last[1].push(appointment);
      else groups.push([key, [appointment]]);
      return groups;
    }, []);
  const listDayFmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short" });

  // ── Month grid ─────────────────────────────────────────────────────────
  const monthByDay = new Map<string, AppointmentCard[]>();
  for (const a of monthAppointments.filter(matchesFilters)) {
    const key = monthDayKey(a.scheduledAt);
    monthByDay.set(key, [...(monthByDay.get(key) ?? []), a]);
  }
  const eventsByDay = new Map<string, typeof monthEvents>();
  for (const event of monthEvents) {
    const key = monthDayKey(event.startsAt);
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
  }
  /* th's Intl calendar is Buddhist by default, so the header reads
     "กันยายน 2569" there and "September 2026" in English with no special
     case. timeZone UTC to match the grid's own days. */
  const monthLabel = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthStart);
  const weekdayFmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", timeZone: "UTC" });
  const canOpenEvents = canSeeItem(session.role, "events");
  const monthHref = (month: Date) => `/${locale}/admin/appointments?month=${toMonthParam(month)}`;
  const CHIPS_PER_DAY = 3;

    function renderCard(a: AppointmentCard) {
    return (
      <div key={a.id} className={`rounded-xs border p-2 text-[11px] leading-snug ${STATUS_BORDER[a.status]}`}>
        <p className="font-semibold text-adm-text">
          {timeFmt.format(a.scheduledAt)} {a.customerName ?? t("noLeadLinked")}
        </p>
        <p className="text-adm-muted">
          {a.projectName ?? t("noProject")}
          {a.assignedToName ? ` · ${a.assignedToName}` : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <AppointmentStatusSelect locale={locale} id={a.id} value={a.status} labels={statusLabels} />
          <AppointmentAssignSelect
            locale={locale}
            appointmentId={a.id}
            value={a.assignedToId}
            assignees={assigneeOptions}
            unassignedLabel={t("unassigned")}
            errorLabel={t("assignError")}
            className="rounded-xs border border-adm-line-strong bg-adm-solid px-1.5 py-1 text-[10.5px] text-adm-text"
          />
          <AppointmentRescheduleInput
            locale={locale}
            id={a.id}
            value={toDateTimeLocal(a.scheduledAt)}
            label={t("reschedule")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* The leads hub's own header: this page is its second tab, and a
          different title here read as having left the section. */}
      <AdminPageHeader
        eyebrow={{ icon: Users, label: "CRM" }}
        title={tRoot("nav.leads")}
        description={tRoot("leads.headerDescription", { count: openLeadCount })}
      />

      <PageTabs
        locale={locale}
        role={session.role}
        groupKey="leads"
        counts={{ pipeline: openLeadCount }}
        carryParams={["project", "assignedTo"]}
      />

      {/* A filter carried in from the leads table narrows this page
          silently otherwise — the week just looks emptier than it is. */}
      {filtered && (
        <p className="flex flex-wrap items-center gap-2 rounded-xs border border-adm-line bg-adm-text/4 px-4 py-2.5 text-sm text-adm-muted">
          {t("filteredNotice", {
            shown: visibleAppointments.length,
            total: weekAppointments.length,
          })}
          <Link
            href={`/${locale}/admin/appointments?week=${toWeekParam(weekStart)}`}
            className="font-medium text-adm-accent-ink hover:text-adm-accent-ink"
          >
            {t("clearFilter")}
          </Link>
        </p>
      )}

      {offline && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {tRoot("common.offline")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Week | month | list (v4), then the period's navigation; the
            new-appointment button at the far right of the same row. */}
        <Segmented
          label={t("viewLabel")}
          active={view}
          items={[
            { key: "week", label: t("viewWeek"), href: `/${locale}/admin/appointments?view=week` },
            { key: "month", label: t("viewMonth"), href: `/${locale}/admin/appointments` },
            { key: "list", label: t("viewList"), href: `/${locale}/admin/appointments?view=list` },
          ]}
        />

        {view === "month" ? (
          <>
            <Link href={monthHref(addMonths(monthStart, -1))} aria-label={t("previousMonth")} className="admin-btn-ghost px-2 py-1.5">
              <ChevronLeft size={14} aria-hidden />
            </Link>
            <Link href={monthHref(addMonths(monthStart, 1))} aria-label={t("nextMonth")} className="admin-btn-ghost px-2 py-1.5">
              <ChevronRight size={14} aria-hidden />
            </Link>
            <span className="text-sm font-semibold text-adm-text">{monthLabel}</span>
            <Link href={`/${locale}/admin/appointments`} className="admin-btn-ghost px-2.5 py-1.5 text-xs">
              {t("today")}
            </Link>
          </>
        ) : view === "list" ? (
          <span className="text-sm font-semibold text-adm-text">{t("listRange", { days: LIST_DAYS })}</span>
        ) : (
          <>
          <Link href={`/${locale}/admin/appointments?view=week&week=${prevWeek}`} className="admin-btn-ghost px-2 py-1.5">
            <ChevronLeft size={14} aria-hidden />
          </Link>
          <Link href={`/${locale}/admin/appointments?view=week&week=${nextWeek}`} className="admin-btn-ghost px-2 py-1.5">
            <ChevronRight size={14} aria-hidden />
          </Link>
          <span className="text-sm font-semibold text-adm-text">{weekLabel}</span>
          <Link href={`/${locale}/admin/appointments?view=week&week=${thisWeek}`} className="admin-btn-ghost px-2.5 py-1.5 text-xs">
            {t("today")}
          </Link>
          </>
        )}

        <div className="ml-auto">
          <AppointmentCreateForm
            locale={locale}
            // Masked: a picker is a list, and lists do not print phone
            // numbers (lib/contact-mask.ts). Enough is left to tell two
            // customers with one name apart.
            leads={recentLeads.map((l) => ({ id: l.id, label: `${l.name} · ${maskPhone(l.phone)}` }))}
            projects={projects.map((p) => ({ id: p.id, label: p.nameEn || p.nameTh }))}
            assignees={assigneeSelectOptions}
            canAssignOthers={canAssignOthers}
            labels={{
              create: t("create"),
              cancel: tRoot("common.cancel"),
              save: tRoot("common.save"),
              lead: t("form.lead"),
              noLead: t("form.noLead"),
              project: t("form.project"),
              noProject: t("noProject"),
              assignedTo: t("form.assignedTo"),
              unassigned: t("unassigned"),
              scheduledAt: t("form.scheduledAt"),
              duration: t("form.duration"),
              location: t("form.location"),
              notes: t("form.notes"),
              error: t("createError"),
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        {view === "month" ? (
          <div className="admin-card overflow-hidden p-0!">
            <div className="grid grid-cols-7 border-b border-adm-line">
              {weeks[0].map(({ date }) => (
                <div key={monthDayKey(date)} className="px-2 py-2 text-center text-[11px] text-adm-muted">
                  {weekdayFmt.format(date)}
                </div>
              ))}
            </div>
            {/* Scrolls sideways inside the card on a phone, never the page. */}
            <div className="overflow-x-auto">
              <div className="grid min-w-[640px] grid-cols-7">
                {weeks.flat().map(({ date, inMonth }) => {
                  const key = monthDayKey(date);
                  const isToday = key === todayKey;
                  const dayAppointments = monthByDay.get(key) ?? [];
                  const dayEvents = eventsByDay.get(key) ?? [];
                  const chips = [
                    ...dayEvents.map((event) => ({ kind: "event" as const, event })),
                    ...dayAppointments.map((appointment) => ({ kind: "appointment" as const, appointment })),
                  ];
                  const hidden = chips.length - CHIPS_PER_DAY;
                  return (
                    <div
                      key={key}
                      className={[
                        "min-h-[104px] border-b border-r border-adm-line p-1.5 [&:nth-child(7n)]:border-r-0",
                        inMonth ? "" : "bg-adm-bg/60",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums",
                          isToday
                            ? "bg-adm-fill font-semibold text-adm-on-fill"
                            : inMonth
                              ? "text-adm-text"
                              : "text-adm-muted/60",
                        ].join(" ")}
                      >
                        {date.getUTCDate()}
                      </span>
                      <div className="flex flex-col gap-1">
                        {chips.slice(0, CHIPS_PER_DAY).map((chip) =>
                          chip.kind === "event" ? (
                            <MaybeLink
                              key={`e-${chip.event.id}`}
                              href={canOpenEvents ? `/${locale}/admin/events/${chip.event.id}/edit` : null}
                              className="truncate rounded-[6px] bg-adm-status-info-bg px-1.5 py-0.5 text-[10.5px] font-medium text-adm-status-info"
                            >
                              {locale === "th" ? chip.event.titleTh : chip.event.titleEn}
                            </MaybeLink>
                          ) : (
                            <MaybeLink
                              key={`a-${chip.appointment.id}`}
                              href={
                                chip.appointment.leadId
                                  ? `/${locale}/admin/leads?lead=${chip.appointment.leadId}`
                                  : null
                              }
                              className={`truncate rounded-[6px] px-1.5 py-0.5 text-[10.5px] ${CHIP_TONE[chip.appointment.status]}`}
                            >
                              <span className="tabular-nums">{timeFmt.format(chip.appointment.scheduledAt)}</span>{" "}
                              {chip.appointment.customerName ?? t("noLeadLinked")}
                            </MaybeLink>
                          ),
                        )}
                        {hidden > 0 && (
                          <span className="px-1.5 text-[10.5px] text-adm-muted">{t("moreOnDay", { count: hidden })}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : view === "list" ? (
          <div className="admin-card overflow-hidden p-0!">
            {listByDay.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-adm-muted">{t("listEmpty", { days: LIST_DAYS })}</p>
            ) : (
              <ol className="divide-y divide-adm-line">
                {listByDay.map(([key, dayAppointments]) => (
                  <li key={key} className="grid gap-3 px-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                    <p className={`text-sm font-semibold ${key === todayKey ? "text-adm-accent-ink" : "text-adm-text"}`}>
                      {listDayFmt.format(dayAppointments[0].scheduledAt)}
                    </p>
                    <div className="grid gap-2 md:grid-cols-2">{dayAppointments.map(renderCard)}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : (
        <div className="admin-card overflow-hidden p-0!">
          <div className="grid grid-cols-7 divide-x divide-adm-line border-b border-adm-line bg-adm-text/4">
            {days.map((d) => {
              const isToday = dayKey(d) === todayKey;
              return (
                <div key={dayKey(d)} className="flex flex-col items-center gap-0.5 px-1 py-2">
                  <span className="text-[10px] text-adm-muted">{dayFmt.format(d)}</span>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday ? "bg-adm-strong text-adm-on-strong" : "text-adm-text"
                    }`}
                  >
                    {d.getUTCDate()}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7 gap-2 p-2" style={{ alignItems: "start" }}>
            {days.map((d) => {
              const dayAppointments = (byDay.get(dayKey(d)) ?? [])
                .slice()
                .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
              return (
                <div key={dayKey(d)} className="flex min-h-[80px] flex-col gap-1.5">
                  {dayAppointments.length === 0 ? (
                    <p className="pt-1 text-center text-[10px] text-adm-muted/60">—</p>
                  ) : (
                    dayAppointments.map(renderCard)
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}

        <div className="flex flex-col gap-4">
          {/* Viewings whose time has passed with nobody saying whether
              they happened. The same list and buttons as the dashboard's
              inbox — one component, so the two cannot drift. */}
          <section className="admin-card overflow-hidden p-0!">
            <div className="flex items-center gap-2 border-b border-adm-line px-3.5 py-2.5">
              <h2 className="text-sm font-semibold text-adm-text">{t("needsAction")}</h2>
              {overdue.count > 0 && (
                <span className="ml-auto rounded-full bg-adm-danger-bg px-2 text-xs font-semibold tabular-nums text-adm-danger">
                  {overdue.count}
                </span>
              )}
            </div>
            <WorkInbox
              locale={locale}
              items={needsAction}
              totals={{ lead: 0, appointment: overdue.count, content: 0 }}
              kinds={["appointment"]}
              currentUserId={session.id}
              variant="rail"
            />
          </section>

          <section className="admin-card p-0!">
            <div className="flex items-center gap-2 border-b border-adm-line px-3.5 py-2.5 text-adm-danger">
              <AlertCircle size={14} aria-hidden />
              <h2 className="text-xs font-semibold uppercase tracking-wide">{t("unassignedQueue")}</h2>
              <span className="ml-auto text-sm font-bold">{unassigned.length}</span>
            </div>
            <div className="flex flex-col gap-2 p-3">
              {unassigned.length === 0 ? (
                <p className="text-xs text-adm-muted">{t("unassignedEmpty")}</p>
              ) : (
                unassigned.map((a) => (
                  <div key={a.id} className="rounded-xs border border-adm-danger/30 bg-adm-solid p-2.5 text-[11px]">
                    <p className="font-semibold text-adm-text">{a.customerName ?? t("noLeadLinked")}</p>
                    <p className="text-adm-muted">
                      {dateRangeFmt.format(a.scheduledAt)} {timeFmt.format(a.scheduledAt)} ·{" "}
                      {a.projectName ?? t("noProject")}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <AppointmentAssignSelect
                        locale={locale}
                        appointmentId={a.id}
                        value={a.assignedToId}
                        assignees={assigneeOptions}
                        unassignedLabel={t("unassigned")}
                        errorLabel={t("assignError")}
                      />
                      <AppointmentRescheduleInput
                        locale={locale}
                        id={a.id}
                        value={toDateTimeLocal(a.scheduledAt)}
                        label={t("reschedule")}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="admin-card p-0!">
            <div className="border-b border-adm-line px-3.5 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-adm-muted">{t("todayLabel")}</h2>
            </div>
            <div className="flex flex-col gap-1.5 p-3">
              {todayAppointments.length === 0 ? (
                <p className="text-xs text-adm-muted">{t("todayEmpty")}</p>
              ) : (
                todayAppointments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-[11.5px]">
                    <span className="w-11 shrink-0 font-semibold text-adm-text">{timeFmt.format(a.scheduledAt)}</span>
                    <span className="flex-1 truncate">{a.customerName ?? t("noLeadLinked")}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="admin-card p-0!">
            <div className="border-b border-adm-line px-3.5 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-adm-muted">{t("workloadLabel")}</h2>
            </div>
            <div className="flex flex-col gap-2 p-3">
              {workload.length === 0 ? (
                <p className="text-xs text-adm-muted">{t("workloadEmpty")}</p>
              ) : (
                (() => {
                  const max = Math.max(1, ...workload.map((w) => w.count));
                  return workload.map((w) => (
                    <div key={w.id}>
                      <div className="flex items-center justify-between text-[11.5px]">
                        <span className="text-adm-text">{w.name}</span>
                        <span className="text-adm-muted">{t("appointmentCount", { count: w.count })}</span>
                      </div>
                      <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-adm-text/4">
                        <div
                          className="h-full rounded-full bg-adm-strong"
                          style={{ width: `${Math.round((w.count / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
