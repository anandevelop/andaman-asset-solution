/**
 * app/[locale]/admin/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Dashboard (Main.dc.html). The top of the page matches that mockup
 * exactly: a personalised greeting, a "today's work queue" row of four
 * live counts each implying an action, the monthly/source charts, and the
 * sales pipeline funnel next to the 4-locale content-completeness summary.
 *
 * Below that — not in the mockup, which is a single fixed-frame screen —
 * this page keeps the additional analytics built for the weekly ops
 * meeting that predate this pass: conversion by project, event RSVPs, the
 * cookie-consent rate, and the recent-leads list. They are real, already
 * wired up, and useful; trimming them was not part of "make the dashboard
 * match the design", so they stay, clearly separated under their own
 * "more reports" heading.
 *
 * The date-range control (DashboardControls) only scopes the lead-source
 * breakdown and the conversion table — the monthly trend chart is always
 * a fixed 12-month view, matching its own subtitle text.
 *
 * All reads go through safeQuery so a database blip degrades to zeroes
 * rather than a 500 on the operator's home screen.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  FUNNEL_STAGES,
  getEventRsvpSummary,
  getLeadPipeline,
  getLeadsBySource,
  getMonthlyLeads,
  getProjectConversions,
} from "@/lib/reports";
import {
  getOverdueResponseQueue,
  getTodayAppointmentQueue,
  getUnassignedLeadQueue,
  RESPONSE_SLA_HOURS,
} from "@/lib/dashboard-queue";
import { getReviewQueueBreakdown } from "@/lib/admin-nav-counts";
import {
  getLocaleCompletenessSummary,
  LOCALE_DISPLAY_ORDER,
  LOCALE_NATIVE_NAMES,
} from "@/lib/locale-completeness";
import { getCookieConsentStats } from "@/lib/cookie-consent-stats";
import {
  LeadSourceChart,
  MonthlyLeadsChart,
} from "@/components/admin/DashboardCharts";
import DashboardControls from "@/components/admin/DashboardControls";
import { isRangeDays, type RangeDays } from "@/lib/dashboard-range";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ denied?: string; range?: string }>;
};

/** "2026-08" → "Aug 26" / "ส.ค. 69" — short enough for a dense x-axis. */
function monthLabel(key: string, locale: string): string {
  const [year, month] = key.split("-").map(Number);

  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    year: "2-digit",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Which of the 3 greetings to use, in the site's own timezone rather than
 *  the server's — a UTC-hosted server saying "good evening" at Bangkok
 *  breakfast time would be a strange thing for this dashboard to get
 *  wrong on its very first line. */
function timeOfDayGreetingKey(now: Date): "greetingMorning" | "greetingAfternoon" | "greetingEvening" {
  const hour =
    Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: "Asia/Bangkok",
      }).format(now),
    ) % 24;

  if (hour < 12) return "greetingMorning";
  if (hour < 18) return "greetingAfternoon";
  return "greetingEvening";
}

/** Tailwind classes for a completeness percentage — green/amber/red,
 *  matching Main.dc.html's exact thresholds (100/100/62/38 rendered as
 *  green/green/amber/red). */
function completenessTone(percent: number): string {
  if (percent >= 90) return "text-emerald-700";
  if (percent >= 50) return "text-accent-700";
  return "text-red-600";
}
function completenessBarTone(percent: number): string {
  if (percent >= 90) return "bg-emerald-700";
  if (percent >= 50) return "bg-accent-500";
  return "bg-red-600";
}

export default async function AdminDashboardPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const { locale } = params;

  // VIEWER — the lowest rank a logged-in account can hold — not EDITOR:
  // guard.ts's `hasRole` failure redirects here (`/admin?denied=1`), so if
  // this page itself demanded more than the lowest role, that redirect
  // would loop. Every other admin page can demand whatever it needs
  // because it always has somewhere else to bounce a denied request to;
  // this one is the bounce target, so it has to accept everyone.
  const session = await requireAdmin(locale, Role.VIEWER);

  const t = await getTranslations({ locale, namespace: "admin" });
  const now = new Date();

  const rangeDays: RangeDays = isRangeDays(searchParams.range) ? searchParams.range : "30";
  // Source/conversion windows are bucketed by month, so a day-count range
  // is rounded up to the nearest month it covers — "7 days" and "30 days"
  // both mean "this month", "365 days" means the full 12-month window.
  const rangeMonths = Math.max(1, Math.ceil(Number(rangeDays) / 30));

  const [
    recentLeads,
    monthly,
    bySource,
    conversions,
    pipeline,
    eventRsvp,
    cookieStats,
    unassignedQueue,
    overdueQueue,
    appointmentQueue,
    reviewBreakdown,
    localeCompleteness,
  ] = await Promise.all([
    safeQuery(
      "dashboard:recentLeads",
      () =>
        prisma.leadInquiry.findMany({
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            createdAt: true,
            project: { select: { nameEn: true, nameTh: true } },
          },
        }),
      [],
    ),
    getMonthlyLeads(12),
    getLeadsBySource(rangeMonths),
    getProjectConversions(locale, rangeMonths),
    getLeadPipeline(),
    getEventRsvpSummary(locale, 6),
    getCookieConsentStats(),
    getUnassignedLeadQueue(),
    getOverdueResponseQueue(),
    getTodayAppointmentQueue(),
    getReviewQueueBreakdown(),
    getLocaleCompletenessSummary(),
  ]);

  const offline = isDatabaseOffline();

  // Widest funnel stage sets the 100%-width bar below (LOST is tracked in
  // `pipeline.stages` but not drawn as a funnel bar — see FUNNEL_STAGES).
  const funnelStages = pipeline.stages.filter((stage) => FUNNEL_STAGES.includes(stage.status));
  const maxPipelineCount = Math.max(...funnelStages.map((stage) => stage.count), 1);

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const timeFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
  const numberFormat = new Intl.NumberFormat(intlLocale(locale));

  // ── Header: greeting + overdue-response subtitle ──────────────────────
  const greeting = t(`dashboard.${timeOfDayGreetingKey(now)}`, { name: session.name });
  const headerSubtitle =
    overdueQueue.count > 0
      ? t("dashboard.overdueSubtitle", { count: overdueQueue.count })
      : t("dashboard.overdueSubtitleNone");

  // ── Monthly chart's detailed subtitle, derived from data already
  //    fetched for the chart itself — no extra query. ───────────────────
  const totalLeads12Months = monthly.reduce((sum, point) => sum + point.total, 0);
  const thisMonthPoint = monthly[monthly.length - 1];
  const prevMonthPoint = monthly[monthly.length - 2];
  const monthChangePercent =
    prevMonthPoint && prevMonthPoint.total > 0
      ? Math.round(((thisMonthPoint.total - prevMonthPoint.total) / prevMonthPoint.total) * 100)
      : null;
  const monthlySubtitle =
    monthChangePercent === null
      ? t("reports.monthly.subtitleDetailedNoChange", {
          total: totalLeads12Months,
          thisMonth: thisMonthPoint?.total ?? 0,
        })
      : t("reports.monthly.subtitleDetailed", {
          total: totalLeads12Months,
          thisMonth: thisMonthPoint?.total ?? 0,
          changeLabel: `${monthChangePercent >= 0 ? "+" : ""}${monthChangePercent}%`,
        });

  // ── Pipeline funnel's detailed subtitle ───────────────────────────────
  const pipelineSubtitle = pipeline.bottleneck
    ? t("reports.pipeline.subtitleDetailed", {
        openTotal: pipeline.openTotal,
        stage: t(`leadStatus.${pipeline.bottleneck.status}` as never),
        avgDays: pipeline.bottleneck.avgDaysInStage,
      })
    : t("reports.pipeline.subtitleSimple", { openTotal: pipeline.openTotal });

  // ── Work-queue card copy ──────────────────────────────────────────────
  const oldestUnassignedHours = unassignedQueue.oldestCreatedAt
    ? Math.max(0, Math.round((now.getTime() - unassignedQueue.oldestCreatedAt.getTime()) / (60 * 60_000)))
    : null;

  const VISIBLE_APPOINTMENT_TIMES = 6;
  const appointmentTimeLabels = appointmentQueue.times
    .slice(0, VISIBLE_APPOINTMENT_TIMES)
    .map((time) => timeFormat.format(time));
  const hiddenAppointmentCount = appointmentQueue.times.length - appointmentTimeLabels.length;

  const reviewBreakdownParts = [
    reviewBreakdown.project > 0 ? `${t("nav.projects")} ${reviewBreakdown.project}` : null,
    reviewBreakdown.news > 0 ? `${t("nav.news")} ${reviewBreakdown.news}` : null,
    reviewBreakdown.event > 0 ? `${t("nav.events")} ${reviewBreakdown.event}` : null,
    reviewBreakdown.brochure > 0 ? `${t("nav.eBrochures")} ${reviewBreakdown.brochure}` : null,
  ].filter((part): part is string => part !== null);

  const localeRows = LOCALE_DISPLAY_ORDER.map(
    (locKey) => localeCompleteness.rows.find((row) => row.locale === locKey) ?? { locale: locKey, percent: 0 },
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="admin-section-title">{t("dashboard.title")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{greeting}</h1>
          <p className="mt-2 text-sm text-ink-muted">{headerSubtitle}</p>
        </div>

        <DashboardControls
          currentRange={rangeDays}
          labels={{
            rangeLabel: t("dashboard.rangeLabel"),
            range7: t("dashboard.range7"),
            range30: t("dashboard.range30"),
            range90: t("dashboard.range90"),
            range365: t("dashboard.range365"),
            exportReport: t("dashboard.exportReport"),
          }}
        />
      </header>

      {/* Set by requireAdmin() when a page demanded a higher role. */}
      {searchParams.denied && (
        <p className="rounded-xs border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {t("common.denied")}
        </p>
      )}

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* ── Today's work queue ───────────────────────────────────────── */}
      <div>
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest2 text-ink-muted">
          {t("dashboard.workQueue.title")}
        </p>

        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {/* Unassigned new leads */}
          <div className="admin-card flex flex-col gap-1 p-4!">
            <span className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              {t("dashboard.workQueue.unassigned.label")}
            </span>
            <span className="text-[28px] font-semibold leading-tight tracking-tight text-primary">
              {numberFormat.format(unassignedQueue.count)}
            </span>
            <span className="text-[11px] text-ink-muted">
              {oldestUnassignedHours === null ? (
                t("dashboard.workQueue.unassigned.none")
              ) : (
                <>
                  {t("dashboard.workQueue.unassigned.oldest", { hours: oldestUnassignedHours })} ·{" "}
                  <Link
                    href={`/${locale}/admin/leads?assignedTo=unassigned`}
                    className="text-accent-700 underline hover:text-accent-800"
                  >
                    {t("dashboard.workQueue.unassigned.assignAll")}
                  </Link>
                </>
              )}
            </span>
          </div>

          {/* Overdue response (SLA) */}
          <div
            className={`admin-card flex flex-col gap-1 p-4! ${
              overdueQueue.count > 0 ? "border-red-300/70" : ""
            }`}
          >
            <span
              className={`flex items-center gap-1.5 text-[11.5px] ${
                overdueQueue.count > 0 ? "font-medium text-red-700" : "text-ink-muted"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  overdueQueue.count > 0 ? "bg-red-600" : "bg-ink-muted"
                }`}
                aria-hidden
              />
              {t("dashboard.workQueue.overdue.label", { hours: RESPONSE_SLA_HOURS })}
            </span>
            <span
              className={`text-[28px] font-semibold leading-tight tracking-tight ${
                overdueQueue.count > 0 ? "text-red-600" : "text-primary"
              }`}
            >
              {numberFormat.format(overdueQueue.count)}
            </span>
            <span className="text-[11px] text-ink-muted">
              {overdueQueue.count > 0 ? (
                <>
                  {t("dashboard.workQueue.overdue.hint")} ·{" "}
                  <Link
                    href={`/${locale}/admin/leads?status=NEW&sort=oldest`}
                    className="text-red-600 hover:text-red-700"
                  >
                    {t("dashboard.workQueue.overdue.viewList")}
                  </Link>
                </>
              ) : (
                t("dashboard.workQueue.overdue.none")
              )}
            </span>
          </div>

          {/* Site visits today */}
          <div className="admin-card flex flex-col gap-1 p-4!">
            <span className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-700" aria-hidden />
              {t("dashboard.workQueue.appointments.label")}
            </span>
            <span className="text-[28px] font-semibold leading-tight tracking-tight text-primary">
              {numberFormat.format(appointmentQueue.count)}
            </span>
            <span className="truncate text-[11px] text-ink-muted">
              {appointmentTimeLabels.length === 0
                ? t("dashboard.workQueue.appointments.none")
                : hiddenAppointmentCount > 0
                  ? `${appointmentTimeLabels.join(" · ")} · ${t("dashboard.workQueue.appointments.more", {
                      count: hiddenAppointmentCount,
                    })}`
                  : appointmentTimeLabels.join(" · ")}
            </span>
          </div>

          {/* Review queue */}
          <div className="admin-card flex flex-col gap-1 p-4!">
            <span className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" aria-hidden />
              {t("dashboard.workQueue.review.label")}
            </span>
            <span className="text-[28px] font-semibold leading-tight tracking-tight text-primary">
              {numberFormat.format(reviewBreakdown.total)}
            </span>
            <span className="text-[11px] text-ink-muted">
              {reviewBreakdown.total === 0 ? (
                t("dashboard.workQueue.review.none")
              ) : (
                <>
                  {reviewBreakdownParts.join(" · ")} ·{" "}
                  <Link href={`/${locale}/admin/publishing`} className="text-accent-700 underline hover:text-accent-800">
                    {t("dashboard.workQueue.review.reviewNow")}
                  </Link>
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* ── Reports ──────────────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[1.85fr_1fr]">
        <section className="admin-card">
          <h2 className="text-base font-semibold text-primary">
            {t("reports.monthly.title")}
          </h2>
          <p className="mb-5 mt-1 text-sm text-ink-muted">{monthlySubtitle}</p>

          <MonthlyLeadsChart
            data={monthly.map((point) => ({
              // Formatted here, not in the chart: the client component does
              // no arithmetic and no localisation.
              label: monthLabel(point.month, locale),
              total: point.total,
              won: point.won,
            }))}
            labels={{
              total: t("reports.monthly.total"),
              won: t("reports.monthly.won"),
              empty: t("common.empty"),
            }}
          />
        </section>

        <section className="admin-card">
          <h2 className="text-base font-semibold text-primary">
            {t("reports.sources.title")}
          </h2>

          <div className="mt-5">
            <LeadSourceChart
              data={bySource.map((slice) => ({
                label: t(`leadSource.${slice.source}` as never),
                count: slice.count,
              }))}
              emptyLabel={t("common.empty")}
            />
          </div>
        </section>
      </div>

      {/* ── Pipeline funnel + 4-locale content completeness ─────────────── */}
      <div className="grid gap-6 xl:grid-cols-[1.85fr_1fr]">
        <section className="admin-card">
          <h2 className="text-base font-semibold text-primary">
            {t("reports.pipeline.title")}
          </h2>
          <p className="mb-5 mt-1 text-sm text-ink-muted">{pipelineSubtitle}</p>

          {funnelStages.every((stage) => stage.count === 0) ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("common.empty")}</p>
          ) : (
            <ul className="space-y-3.5">
              {funnelStages.map((stage) => {
                const isBottleneck = pipeline.bottleneck?.status === stage.status;
                return (
                  <li key={stage.status} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-xs font-medium text-ink-muted sm:w-40">
                      {t(`leadStatus.${stage.status}` as never)}
                    </span>
                    <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-primary/5">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-accent-700"
                        style={{ width: `${Math.round((stage.count / maxPipelineCount) * 100)}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums text-primary">
                      {stage.count}
                    </span>
                    {isBottleneck && (
                      <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-red-600">
                        {t("reports.pipeline.bottleneckFlag")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="admin-card">
          <h2 className="text-base font-semibold text-primary">
            {t("reports.localeCompleteness.title")}
          </h2>

          <div className="mt-5 space-y-3.5">
            {localeRows.map((row) => (
              <div key={row.locale}>
                <div className="mb-1 flex items-center justify-between text-[11.5px]">
                  <span className="font-medium text-ink">{LOCALE_NATIVE_NAMES[row.locale] ?? row.locale}</span>
                  <span className={`font-semibold tabular-nums ${completenessTone(row.percent)}`}>
                    {row.percent}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-primary/5">
                  <div
                    className={`h-full rounded-full ${completenessBarTone(row.percent)}`}
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
              </div>
            ))}

            <Link
              href={`/${locale}/admin/publishing`}
              className="mt-1 inline-block text-[11.5px] font-medium text-accent-700 hover:text-accent-800"
            >
              {localeCompleteness.missingCount > 0
                ? t("reports.localeCompleteness.viewMissing", { count: localeCompleteness.missingCount })
                : t("reports.localeCompleteness.viewMissingNone")}
            </Link>
          </div>
        </section>
      </div>

      {/* ── More reports — supplementary analytics beyond the mockup's
          single fixed frame; kept, not part of "match the design". ──── */}
      <p className="admin-section-title text-ink-muted!">{t("dashboard.moreReports")}</p>

      {/* ── Conversion by project ────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="text-base font-semibold text-primary">
          {t("reports.conversion.title")}
        </h2>
        <p className="mb-5 mt-1 text-sm text-ink-muted">
          {t("reports.conversion.subtitle")}
        </p>

        {conversions.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{t("common.empty")}</p>
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[560px] border-collapse">
              <thead className="border-b border-primary/10">
                <tr>
                  <th className="admin-th">{t("projects.name")}</th>
                  <th className="admin-th text-right">{t("reports.conversion.total")}</th>
                  <th className="admin-th text-right">{t("reports.conversion.worked")}</th>
                  <th className="admin-th text-right">{t("reports.conversion.won")}</th>
                  <th className="admin-th text-right">{t("reports.conversion.rate")}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-primary/5">
                {conversions.map((row) => (
                  <tr key={row.projectId}>
                    <td className="admin-td font-medium text-primary">{row.name}</td>
                    <td className="admin-td text-right tabular-nums text-ink-muted">
                      {row.total}
                    </td>
                    <td className="admin-td text-right tabular-nums text-ink-muted">
                      {row.worked}
                    </td>
                    <td className="admin-td text-right tabular-nums text-ink-muted">
                      {row.won}
                    </td>
                    <td className="admin-td text-right">
                      {row.rate === null ? (
                        // Not zero. "Nobody has called them yet" and "we
                        // called everyone and closed none" are different facts.
                        <span className="text-xs text-ink-muted">
                          {t("reports.conversion.notWorked")}
                        </span>
                      ) : (
                        <span
                          className={`text-sm font-medium tabular-nums ${
                            row.rate >= 20 ? "text-emerald-700" : "text-primary"
                          }`}
                        >
                          {row.rate}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── RSVP summary + cookie consent rate ──────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="admin-card">
          <h2 className="text-base font-semibold text-primary">
            {t("reports.rsvp.title")}
          </h2>
          <p className="mb-5 mt-1 text-sm text-ink-muted">
            {t("reports.rsvp.subtitle")}
          </p>

          {eventRsvp.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("common.empty")}</p>
          ) : (
            <ul className="divide-y divide-primary/5">
              {eventRsvp.map((event) => (
                <li key={event.eventId} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="truncate text-sm font-medium text-ink">{event.title}</p>
                    <time
                      dateTime={event.startsAt.toISOString()}
                      className="shrink-0 text-xs text-ink-muted"
                    >
                      {dateFormat.format(event.startsAt)}
                    </time>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-primary/5">
                      {event.fillRate !== null && (
                        <span
                          className="absolute inset-y-0 left-0 rounded-full bg-accent-700"
                          style={{ width: `${Math.min(100, event.fillRate)}%` }}
                        />
                      )}
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-ink-muted">
                      {event.capacity !== null
                        ? t("reports.rsvp.filled", {
                            registered: event.registered,
                            capacity: event.capacity,
                          })
                        : t("reports.rsvp.registeredOnly", { registered: event.registered })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-card">
          <h2 className="text-base font-semibold text-primary">
            {t("reports.cookieConsent.title")}
          </h2>
          <p className="mb-5 mt-1 text-sm text-ink-muted">
            {t("reports.cookieConsent.subtitle", { total: cookieStats.total })}
          </p>

          {cookieStats.total === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("common.empty")}</p>
          ) : (
            <div className="space-y-5">
              <ConsentRateRow
                label={t("reports.cookieConsent.analytics")}
                rate={cookieStats.analyticsRate}
              />
              <ConsentRateRow
                label={t("reports.cookieConsent.marketing")}
                rate={cookieStats.marketingRate}
              />
            </div>
          )}
        </section>
      </div>

      <section className="admin-card">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-primary">
            {t("dashboard.recentLeads")}
          </h2>
          <Link
            href={`/${locale}/admin/leads`}
            className="inline-flex items-center gap-1.5 text-sm text-accent-700 hover:text-accent-800"
          >
            {t("dashboard.viewAll")}
          </Link>
        </div>

        {recentLeads.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{t("common.empty")}</p>
        ) : (
          <ul className="divide-y divide-primary/5">
            {recentLeads.map((lead) => (
              <li
                key={lead.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{lead.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {lead.project
                      ? locale === "th"
                        ? lead.project.nameTh
                        : lead.project.nameEn
                      : t("leads.noProject")}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-ink-muted">
                  <span className="rounded-xs bg-primary/5 px-2 py-1 font-medium text-primary">
                    {t(`leadStatus.${lead.status}` as never)}
                  </span>
                  <time dateTime={lead.createdAt.toISOString()}>
                    {dateFormat.format(lead.createdAt)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * One row of the cookie-consent card: a label, its granted rate, and a
 * proportional bar. `rate` is only null when there are zero decisions yet
 * (getCookieConsentStats() guards the divide), which the caller already
 * handles by not rendering this component at all in that case — so `?? 0`
 * here is just keeping TypeScript happy, not a real fallback path.
 */
function ConsentRateRow({ label, rate }: { label: string; rate: number | null }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink-muted">{label}</span>
        <span className="font-medium tabular-nums text-primary">{rate ?? 0}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-primary/5">
        <div
          className="h-full rounded-full bg-accent-700"
          style={{ width: `${rate ?? 0}%` }}
        />
      </div>
    </div>
  );
}
