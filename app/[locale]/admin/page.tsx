/**
 * app/[locale]/admin/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Dashboard. Four counters chosen because each one implies an action:
 * new leads need a call, this week's volume tells you if marketing is
 * working, published projects is the blast radius of a bad edit, and an
 * event inside 30 days needs staffing.
 *
 * Below the counters: monthly/source charts, conversion by project, a
 * pipeline funnel (where the current backlog is stuck, not windowed to a
 * date range — see getLeadPipeline()'s own comment), an RSVP-vs-capacity
 * summary per event, and the cookie banner's aggregate accept rate
 * (lib/cookie-consent-stats.ts — anonymous counters, not a visitor log).
 * All of it built for the weekly ops/leadership meeting, not day-to-day
 * lead handling — that is what /admin/leads is for.
 *
 * All reads go through safeQuery so a database blip degrades to zeroes
 * rather than a 500 on the operator's home screen.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LeadStatus } from "@prisma/client";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  TrendingUp,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  getEventRsvpSummary,
  getLeadPipeline,
  getLeadsBySource,
  getMonthlyLeads,
  getProjectConversions,
  getWeekOverWeekLeads,
} from "@/lib/reports";
import { getCookieConsentStats } from "@/lib/cookie-consent-stats";
import {
  LeadSourceChart,
  MonthlyLeadsChart,
} from "@/components/admin/DashboardCharts";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";

type Props = {
  params: { locale: string };
  searchParams: { denied?: string };
};

const DAY_MS = 24 * 60 * 60_000;

/** "2026-08" → "Aug 26" / "ส.ค. 69" — short enough for a dense x-axis. */
function monthLabel(key: string, locale: string): string {
  const [year, month] = key.split("-").map(Number);

  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    year: "2-digit",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export default async function AdminDashboardPage({
  params: { locale },
  searchParams,
}: Props) {
  await requireAdmin(locale);

  const t = await getTranslations({ locale, namespace: "admin" });
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const in30Days = new Date(now.getTime() + 30 * DAY_MS);

  const [
    newLeads,
    weekOverWeek,
    publishedProjects,
    upcomingEvents,
    recentLeads,
    monthly,
    bySource,
    conversions,
    pipeline,
    eventRsvp,
    cookieStats,
  ] = await Promise.all([
      safeQuery(
        "dashboard:newLeads",
        () => prisma.leadInquiry.count({ where: { status: LeadStatus.NEW } }),
        0,
      ),
      getWeekOverWeekLeads(),
      safeQuery(
        "dashboard:publishedProjects",
        () =>
          prisma.project.count({ where: { isPublished: true, deletedAt: null } }),
        0,
      ),
      safeQuery(
        "dashboard:upcomingEvents",
        () =>
          prisma.event.count({
            where: { isPublished: true, startsAt: { gte: now, lte: in30Days } },
          }),
        0,
      ),
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
    getLeadsBySource(12),
    getProjectConversions(locale, 12),
    getLeadPipeline(),
    getEventRsvpSummary(locale, 6),
    getCookieConsentStats(),
  ]);

  const offline = isDatabaseOffline();
  // Widest stage sets the 100%-width bar in the pipeline funnel below;
  // `|| 1` only matters when every stage is genuinely empty, so it never
  // divides by zero.
  const maxPipelineCount = Math.max(...pipeline.map((stage) => stage.count), 1);

  // `delta` is only meaningful on leadsThisWeek (the one card with a prior
  // week to compare against) but every card carries the field — TS infers a
  // clean union from `as const` when every variant has the same keys, and
  // the renderer below only has to check one thing: is delta null.
  const cards = [
    {
      key: "newLeads",
      value: newLeads,
      icon: Users,
      href: `/${locale}/admin/leads?status=NEW`,
      delta: null as number | null,
    },
    {
      key: "leadsThisWeek",
      value: weekOverWeek.thisWeek,
      icon: TrendingUp,
      href: `/${locale}/admin/leads`,
      delta: weekOverWeek.changePercent,
    },
    {
      key: "publishedProjects",
      value: publishedProjects,
      icon: Building2,
      href: `/${locale}/admin/projects`,
      delta: null as number | null,
    },
    {
      key: "upcomingEvents",
      value: upcomingEvents,
      icon: CalendarDays,
      href: `/${locale}/admin/events`,
      delta: null as number | null,
    },
  ] as const;

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-10">
      <header>
        <p className="admin-section-title">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("dashboard.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t("dashboard.subtitle")}</p>
      </header>

      {/* Set by requireAdmin() when a page demanded a higher role. */}
      {searchParams.denied && (
        <p className="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {t("common.denied")}
        </p>
      )}

      {offline && (
        <p className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ key, value, icon: Icon, href, delta }) => (
          <Link
            key={key}
            href={href}
            className="admin-card group transition-shadow hover:shadow-cardHover"
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {t(`dashboard.${key}` as never)}
              </p>
              <Icon size={18} strokeWidth={1.75} className="text-accent-700" aria-hidden />
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <p className="text-3xl font-semibold tabular-nums text-primary">
                {new Intl.NumberFormat(intlLocale(locale)).format(value)}
              </p>
              {/* null when there is no prior week to compare against yet —
                  showing "+100%" off a zero baseline would be meaningless. */}
              {delta !== null && (
                <span
                  className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                    delta >= 0 ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {delta >= 0 ? (
                    <ArrowUpRight size={12} aria-hidden />
                  ) : (
                    <ArrowDownRight size={12} aria-hidden />
                  )}
                  {Math.abs(delta)}%
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {t(`dashboard.${key}Hint` as never)}
            </p>
          </Link>
        ))}
      </div>

      {/* ── Reports ──────────────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="admin-card">
          <h2 className="text-base font-semibold text-primary">
            {t("reports.monthly.title")}
          </h2>
          <p className="mb-5 mt-1 text-sm text-ink-muted">
            {t("reports.monthly.subtitle")}
          </p>

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
          <p className="mb-5 mt-1 text-sm text-ink-muted">
            {t("reports.sources.subtitle")}
          </p>

          <LeadSourceChart
            data={bySource.map((slice) => ({
              label: t(`leadSource.${slice.source}` as never),
              count: slice.count,
            }))}
            emptyLabel={t("common.empty")}
          />
        </section>
      </div>

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

      {/* ── Pipeline funnel ──────────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="text-base font-semibold text-primary">
          {t("reports.pipeline.title")}
        </h2>
        <p className="mb-5 mt-1 text-sm text-ink-muted">
          {t("reports.pipeline.subtitle")}
        </p>

        {pipeline.every((stage) => stage.count === 0) ? (
          <p className="py-6 text-center text-sm text-ink-muted">{t("common.empty")}</p>
        ) : (
          <ul className="space-y-3.5">
            {pipeline.map((stage) => (
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
              </li>
            ))}
          </ul>
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
            <ArrowRight size={14} aria-hidden />
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
                  <span className="rounded-sm bg-primary/5 px-2 py-1 font-medium text-primary">
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
