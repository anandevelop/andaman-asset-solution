/**
 * app/[locale]/admin/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Dashboard — "what needs doing today", and nothing else.
 *
 * WHAT THIS PAGE USED TO BE, AND WHY IT IS NOT THAT ANY MORE
 *
 * It drew seven reports: the monthly trend, the source breakdown, the
 * pipeline funnel, conversion by project, event RSVPs, the cookie-consent
 * rate and the 4-locale completeness bars. Four of those seven were the
 * same charts /admin/analytics already drew from the same lib/reports.ts
 * functions, so the two screens answered the same question twice and could
 * be read as disagreeing whenever their windows differed — the dashboard's
 * source breakdown followed `?range=`, the analytics one was fixed at 12
 * months. The other three existed only here, which made this page the only
 * way to reach them and the reports screen incomplete.
 *
 * So: every report now lives at /admin/analytics, the three that were only
 * here moved there rather than being dropped, and the date-range picker
 * and CSV export (DashboardControls) went with them — they scoped reports,
 * and there are no reports here to scope.
 *
 * What stays is the work queue this page opens with: four live counts, each
 * a link into the screen where that work is actually done, plus this
 * month's three headline numbers as the reason to follow the link to the
 * full reports. Content completeness went to /admin/publishing, which is
 * where somebody acts on a missing translation.
 *
 * All reads go through safeQuery so a database blip degrades to zeroes
 * rather than a 500 on the operator's home screen.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getMonthSummary,
  getOverdueResponseQueue,
  getTodayAppointmentQueue,
  getUnassignedLeadQueue,
  RESPONSE_SLA_HOURS,
} from "@/lib/dashboard-queue";
import { getReviewQueueBreakdown } from "@/lib/admin-nav-counts";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { canSeeItem } from "@/lib/admin/nav";
import { intlLocale } from "@/lib/format";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ denied?: string }>;
};

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

  const [recentLeads, unassignedQueue, overdueQueue, appointmentQueue, reviewBreakdown, month] =
    await Promise.all([
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
      getUnassignedLeadQueue(),
      getOverdueResponseQueue(),
      getTodayAppointmentQueue(),
      getReviewQueueBreakdown(),
      getMonthSummary(),
    ]);

  const offline = isDatabaseOffline();

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

  /* The link to the full reports is drawn only for a role /admin/analytics
     would actually admit — canSee() against the real nav item rather than
     a role list written out again here, which is how the "Mobile view"
     link came to be shown to editors the page then refused. */
  const canOpenAnalytics = canSeeItem(session.role, "analytics");

  return (
    <div className="space-y-10">
      <header>
        <p className="admin-section-title">{t("dashboard.title")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{greeting}</h1>
        <p className="mt-2 text-sm text-ink-muted">{headerSubtitle}</p>
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
          <QueueCard
            href={`/${locale}/admin/leads?assignedTo=unassigned`}
            tone="accent"
            label={t("dashboard.workQueue.unassigned.label")}
            value={numberFormat.format(unassignedQueue.count)}
            hint={
              oldestUnassignedHours === null
                ? t("dashboard.workQueue.unassigned.none")
                : t("dashboard.workQueue.unassigned.oldest", { hours: oldestUnassignedHours })
            }
          />

          <QueueCard
            href={`/${locale}/admin/leads?status=NEW&sort=oldest`}
            tone={overdueQueue.count > 0 ? "danger" : "neutral"}
            label={t("dashboard.workQueue.overdue.label", { hours: RESPONSE_SLA_HOURS })}
            value={numberFormat.format(overdueQueue.count)}
            hint={
              overdueQueue.count > 0
                ? t("dashboard.workQueue.overdue.hint")
                : t("dashboard.workQueue.overdue.none")
            }
          />

          <QueueCard
            href={`/${locale}/admin/appointments`}
            tone="positive"
            label={t("dashboard.workQueue.appointments.label")}
            value={numberFormat.format(appointmentQueue.count)}
            hint={
              appointmentTimeLabels.length === 0
                ? t("dashboard.workQueue.appointments.none")
                : hiddenAppointmentCount > 0
                  ? `${appointmentTimeLabels.join(" · ")} · ${t("dashboard.workQueue.appointments.more", {
                      count: hiddenAppointmentCount,
                    })}`
                  : appointmentTimeLabels.join(" · ")
            }
          />

          <QueueCard
            href={`/${locale}/admin/publishing`}
            tone="neutral"
            label={t("dashboard.workQueue.review.label")}
            value={numberFormat.format(reviewBreakdown.total)}
            hint={
              reviewBreakdown.total === 0
                ? t("dashboard.workQueue.review.none")
                : reviewBreakdownParts.join(" · ")
            }
          />
        </div>
      </div>

      {/* ── This month in three numbers ──────────────────────────────── */}
      <section className="admin-card">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-base font-semibold text-primary">{t("dashboard.monthSummary.title")}</h2>

          {canOpenAnalytics && (
            <Link
              href={`/${locale}/admin/analytics`}
              className="text-sm font-medium text-accent-700 hover:text-accent-800"
            >
              {t("dashboard.monthSummary.viewFullReports")}
            </Link>
          )}
        </div>

        <dl className="mt-5 grid gap-5 sm:grid-cols-3">
          <MonthFigure label={t("dashboard.monthSummary.newLeads")} value={numberFormat.format(month.newLeads)} />
          <MonthFigure
            label={t("dashboard.monthSummary.appointments")}
            value={numberFormat.format(month.appointments)}
          />
          <MonthFigure label={t("dashboard.monthSummary.booked")} value={numberFormat.format(month.booked)} />
        </dl>
      </section>

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

type QueueTone = "accent" | "danger" | "positive" | "neutral";

const QUEUE_DOT: Record<QueueTone, string> = {
  accent: "bg-accent",
  danger: "bg-red-600",
  positive: "bg-emerald-700",
  neutral: "bg-ink-muted",
};

/**
 * One work-queue card.
 *
 * The whole card is the link, not a "view list" anchor buried in its
 * footnote: every one of these four counts exists to be acted on, and the
 * act is always "open the filtered screen behind it". The footnote anchors
 * that used to do this could not survive the card becoming a link anyway —
 * an <a> inside an <a> is not valid HTML, and browsers recover from it by
 * dropping one of them.
 */
function QueueCard({
  href,
  tone,
  label,
  value,
  hint,
}: {
  href: string;
  tone: QueueTone;
  label: string;
  value: string;
  hint: ReactNode;
}) {
  const alert = tone === "danger";

  return (
    <Link
      href={href}
      className={[
        "admin-card flex flex-col gap-1 p-4! transition-colors hover:border-accent/60",
        alert ? "border-red-300/70" : "",
      ].join(" ")}
    >
      <span
        className={`flex items-center gap-1.5 text-[11.5px] ${
          alert ? "font-medium text-red-700" : "text-ink-muted"
        }`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${QUEUE_DOT[tone]}`} aria-hidden />
        {label}
      </span>
      <span
        className={`text-[28px] font-semibold leading-tight tracking-tight ${
          alert ? "text-red-600" : "text-primary"
        }`}
      >
        {value}
      </span>
      <span className="truncate text-[11px] text-ink-muted">{hint}</span>
    </Link>
  );
}

/** One of the three month-to-date figures. */
function MonthFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-ink-muted">{label}</dt>
      <dd className="mt-1 text-[28px] font-semibold leading-tight tracking-tight text-primary">
        {value}
      </dd>
    </div>
  );
}
