/**
 * app/[locale]/admin/appointments/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The appointments calendar — a week-by-week agenda (see lib/appointments.ts
 * for why this is a day-by-day list rather than an absolute-time grid),
 * an unassigned queue that is never allowed to hide, today's rundown, and
 * this week's per-rep workload.
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
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { AppointmentStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireCapability } from "@/lib/admin/guard";
import { intlLocale, toDateTimeLocal } from "@/lib/format";
import {
  type AppointmentCard,
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

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string }>;
};

const DAY_MS = 24 * 60 * 60_000;

const STATUS_BORDER: Record<AppointmentStatus, string> = {
  REQUESTED: "border-amber-300 bg-amber-50",
  CONFIRMED: "border-emerald-300 bg-emerald-50",
  COMPLETED: "border-primary/15 bg-surface-muted",
  CANCELLED: "border-primary/10 bg-white opacity-60",
  NO_SHOW: "border-red-300 bg-red-50",
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function AdminAppointmentsPage(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { locale } = params;

  /* Capability, not rank: EDITOR outranks SALES, so the old
     requireAdmin(locale, Role.SALES) here let every content editor read
     every customer's name, phone and email. See lib/permissions.ts. */
  const session = await requireCapability(locale, "viewAllLeads");

  const weekStart = parseWeekParam(searchParams.week);
  const days = weekDays(weekStart);
  const prevWeek = toWeekParam(new Date(weekStart.getTime() - 7 * DAY_MS));
  const nextWeek = toWeekParam(new Date(weekStart.getTime() + 7 * DAY_MS));
  const thisWeek = toWeekParam(new Date());

  const [tRoot, t, tStatus, weekAppointments, unassigned, workload, recentLeads, projects] = await Promise.all([
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
  ]);

  const offline = isDatabaseOffline();

  const byDay = new Map<string, AppointmentCard[]>();
  for (const a of weekAppointments) {
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

  function renderCard(a: AppointmentCard) {
    return (
      <div key={a.id} className={`rounded-xs border p-2 text-[11px] leading-snug ${STATUS_BORDER[a.status]}`}>
        <p className="font-semibold text-primary">
          {timeFmt.format(a.scheduledAt)} {a.customerName ?? t("noLeadLinked")}
        </p>
        <p className="text-ink-muted">
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
            className="rounded-xs border border-primary/15 bg-white px-1.5 py-1 text-[10.5px] text-ink"
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="admin-section-title">{t("eyebrow")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{t("title")}</h1>
        </div>
        <AppointmentCreateForm
          locale={locale}
          leads={recentLeads.map((l) => ({ id: l.id, label: `${l.name} · ${l.phone}` }))}
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
      </header>

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {tRoot("common.offline")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <Link href={`/${locale}/admin/appointments?week=${prevWeek}`} className="admin-btn-ghost px-2 py-1.5">
          <ChevronLeft size={14} aria-hidden />
        </Link>
        <Link href={`/${locale}/admin/appointments?week=${nextWeek}`} className="admin-btn-ghost px-2 py-1.5">
          <ChevronRight size={14} aria-hidden />
        </Link>
        <span className="text-sm font-semibold text-primary">{weekLabel}</span>
        <Link href={`/${locale}/admin/appointments?week=${thisWeek}`} className="admin-btn-ghost px-2.5 py-1.5 text-xs">
          {t("today")}
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="admin-card overflow-hidden p-0!">
          <div className="grid grid-cols-7 divide-x divide-primary/5 border-b border-primary/10 bg-surface-muted">
            {days.map((d) => {
              const isToday = dayKey(d) === todayKey;
              return (
                <div key={dayKey(d)} className="flex flex-col items-center gap-0.5 px-1 py-2">
                  <span className="text-[10px] text-ink-muted">{dayFmt.format(d)}</span>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday ? "bg-primary text-white" : "text-primary"
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
                    <p className="pt-1 text-center text-[10px] text-ink-muted/60">—</p>
                  ) : (
                    dayAppointments.map(renderCard)
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <section className="admin-card p-0!">
            <div className="flex items-center gap-2 border-b border-primary/10 px-3.5 py-2.5 text-red-700">
              <AlertCircle size={14} aria-hidden />
              <h2 className="text-xs font-semibold uppercase tracking-wide">{t("unassignedQueue")}</h2>
              <span className="ml-auto text-sm font-bold">{unassigned.length}</span>
            </div>
            <div className="flex flex-col gap-2 p-3">
              {unassigned.length === 0 ? (
                <p className="text-xs text-ink-muted">{t("unassignedEmpty")}</p>
              ) : (
                unassigned.map((a) => (
                  <div key={a.id} className="rounded-xs border border-red-200 bg-white p-2.5 text-[11px]">
                    <p className="font-semibold text-primary">{a.customerName ?? t("noLeadLinked")}</p>
                    <p className="text-ink-muted">
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
            <div className="border-b border-primary/10 px-3.5 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("todayLabel")}</h2>
            </div>
            <div className="flex flex-col gap-1.5 p-3">
              {todayAppointments.length === 0 ? (
                <p className="text-xs text-ink-muted">{t("todayEmpty")}</p>
              ) : (
                todayAppointments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-[11.5px]">
                    <span className="w-11 shrink-0 font-semibold text-primary">{timeFmt.format(a.scheduledAt)}</span>
                    <span className="flex-1 truncate">{a.customerName ?? t("noLeadLinked")}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="admin-card p-0!">
            <div className="border-b border-primary/10 px-3.5 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("workloadLabel")}</h2>
            </div>
            <div className="flex flex-col gap-2 p-3">
              {workload.length === 0 ? (
                <p className="text-xs text-ink-muted">{t("workloadEmpty")}</p>
              ) : (
                (() => {
                  const max = Math.max(1, ...workload.map((w) => w.count));
                  return workload.map((w) => (
                    <div key={w.id}>
                      <div className="flex items-center justify-between text-[11.5px]">
                        <span className="text-ink">{w.name}</span>
                        <span className="text-ink-muted">{t("appointmentCount", { count: w.count })}</span>
                      </div>
                      <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-primary"
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
