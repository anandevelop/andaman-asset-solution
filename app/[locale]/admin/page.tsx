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
 * Beside the queue: the latest leads, and unit stock per project — the one
 * number sales and content both ask for first, and until now only
 * reachable by opening each project's units tab in turn.
 *
 * All reads go through safeQuery so a database blip degrades to zeroes
 * rather than a 500 on the operator's home screen.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, CalendarClock, Clock, FileCheck2, UserPlus, type LucideIcon } from "lucide-react";
import { LeadStatus, Role, UnitStatus } from "@prisma/client";
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
import { initialsFrom, intlLocale } from "@/lib/format";

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

  const [recentLeads, unassignedQueue, overdueQueue, appointmentQueue, reviewBreakdown, month, inventory] =
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
      safeQuery(
        "dashboard:inventory",
        async () => {
          const [projects, counts] = await Promise.all([
            prisma.project.findMany({
              where: { deletedAt: null },
              orderBy: { sortOrder: "asc" },
              select: { id: true, nameEn: true, nameTh: true },
            }),
            prisma.projectUnit.groupBy({
              by: ["projectId", "status"],
              _count: { _all: true },
            }),
          ]);

          const count = (projectId: string, status: UnitStatus) =>
            counts.find((row) => row.projectId === projectId && row.status === status)?._count._all ?? 0;

          return (
            projects
              .map((project) => {
                const sold = count(project.id, UnitStatus.SOLD);
                const reserved = count(project.id, UnitStatus.RESERVED);
                const available = count(project.id, UnitStatus.AVAILABLE);
                return { ...project, sold, reserved, available, total: sold + reserved + available };
              })
              // A project with no plots entered yet has nothing to show but
              // an empty bar, which reads as "sold out" at a glance.
              .filter((project) => project.total > 0)
          );
        },
        [],
      ),
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
  const canOpenLeads = canSeeItem(session.role, "leads");
  const canOpenProjects = canSeeItem(session.role, "projects");

  const projectName = (project: { nameEn: string; nameTh: string | null }) =>
    locale === "th" && project.nameTh ? project.nameTh : project.nameEn;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-ink">{greeting}</h1>
          <p className="mt-1 text-sm text-ink-muted">{headerSubtitle}</p>
        </div>

        {canOpenAnalytics && (
          <Link href={`/${locale}/admin/analytics`} className="admin-btn-ghost">
            {t("dashboard.monthSummary.viewFullReports")}
            <ArrowRight size={14} aria-hidden />
          </Link>
        )}
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
      <section aria-label={t("dashboard.workQueue.title")}>
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <QueueCard
            href={`/${locale}/admin/leads?assignedTo=unassigned`}
            tone="accent"
            icon={UserPlus}
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
            icon={Clock}
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
            icon={CalendarClock}
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
            icon={FileCheck2}
            label={t("dashboard.workQueue.review.label")}
            value={numberFormat.format(reviewBreakdown.total)}
            hint={
              reviewBreakdown.total === 0
                ? t("dashboard.workQueue.review.none")
                : reviewBreakdownParts.join(" · ")
            }
          />
        </div>
      </section>

      <div className="grid items-start gap-3.5 lg:grid-cols-3">
        {/* ── Latest leads ─────────────────────────────────────────── */}
        <section className="admin-card overflow-hidden p-0! lg:col-span-2">
          <CardHeader
            title={t("dashboard.recentLeads")}
            action={
              canOpenLeads && (
                <Link
                  href={`/${locale}/admin/leads`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-primary"
                >
                  {t("dashboard.viewAll")}
                  <ArrowRight size={13} aria-hidden />
                </Link>
              )
            }
          />

          {recentLeads.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">{t("common.empty")}</p>
          ) : (
            <ul className="divide-y divide-primary/5">
              {recentLeads.map((lead) => (
                <li key={lead.id}>
                  <MaybeLink
                    href={canOpenLeads ? `/${locale}/admin/leads?lead=${lead.id}` : null}
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface"
                  >
                    <span
                      aria-hidden
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[10.5px] font-semibold text-primary-500"
                    >
                      {initialsFrom(lead.name) || "·"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{lead.name}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {lead.project ? projectName(lead.project) : t("leads.noProject")}
                      </span>
                    </span>
                    <StatusPill status={lead.status} label={t(`leadStatus.${lead.status}` as never)} />
                    <time
                      dateTime={lead.createdAt.toISOString()}
                      className="hidden w-28 shrink-0 text-right text-xs tabular-nums text-ink-muted sm:block"
                    >
                      {dateFormat.format(lead.createdAt)}
                    </time>
                  </MaybeLink>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-3.5">
          {/* ── Unit stock per project ─────────────────────────────── */}
          {inventory.length > 0 && (
            <section className="admin-card overflow-hidden p-0!">
              <CardHeader
                title={t("dashboard.inventory.title")}
                action={
                  <span className="flex items-center gap-3 text-[11px] text-ink-muted">
                    <LegendDot className="bg-primary" label={t("dashboard.inventory.sold")} />
                    <LegendDot className="bg-accent" label={t("dashboard.inventory.reserved")} />
                    <LegendDot
                      className="bg-surface-muted ring-1 ring-primary/10"
                      label={t("dashboard.inventory.available")}
                    />
                  </span>
                }
              />
              <ul className="space-y-4 px-5 py-4">
                {inventory.map((project) => (
                  <li key={project.id}>
                    <MaybeLink
                      href={canOpenProjects ? `/${locale}/admin/projects/${project.id}/units` : null}
                      className="group block"
                    >
                      <span className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate font-medium text-ink group-hover:text-primary-500">
                          {projectName(project)}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                          {t("dashboard.inventory.freeOfTotal", {
                            free: numberFormat.format(project.available),
                            total: numberFormat.format(project.total),
                          })}
                        </span>
                      </span>
                      <span className="flex h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        <span className="bg-primary" style={{ width: `${(project.sold / project.total) * 100}%` }} />
                        <span className="bg-accent" style={{ width: `${(project.reserved / project.total) * 100}%` }} />
                      </span>
                    </MaybeLink>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── This month in three numbers ──────────────────────────── */}
          <section className="admin-card overflow-hidden p-0!">
            <CardHeader title={t("dashboard.monthSummary.title")} />
            <dl className="grid grid-cols-3 divide-x divide-primary/5">
              <MonthFigure label={t("dashboard.monthSummary.newLeads")} value={numberFormat.format(month.newLeads)} />
              <MonthFigure
                label={t("dashboard.monthSummary.appointments")}
                value={numberFormat.format(month.appointments)}
              />
              <MonthFigure label={t("dashboard.monthSummary.booked")} value={numberFormat.format(month.booked)} />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

/** A row that is a link only for a role the destination admits — the same
 *  rule nav.ts applies to the sidebar, so nothing here lands on a denial. */
function MaybeLink({ href, className, children }: { href: string | null; className: string; children: ReactNode }) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[46px] flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-primary/5 px-5 py-2.5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-2 w-2 rounded-[2px] ${className}`} />
      {label}
    </span>
  );
}

/* Colour carries the stage at a glance; the label still says it, so the
   pill is never the only way to tell two statuses apart. */
const STATUS_TONE: Record<LeadStatus, string> = {
  NEW: "bg-primary-50 text-primary-500",
  CONTACTED: "bg-surface-muted text-ink-muted",
  QUALIFIED: "bg-violet-50 text-violet-700",
  VIEWING_SCHEDULED: "bg-accent-50 text-accent-700",
  NEGOTIATING: "bg-amber-50 text-amber-700",
  WON: "bg-emerald-50 text-emerald-700",
  LOST: "bg-red-50 text-red-700",
};

function StatusPill({ status, label }: { status: LeadStatus; label: string }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11px] font-medium ${STATUS_TONE[status]}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
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
  icon: Icon,
  label,
  value,
  hint,
}: {
  href: string;
  tone: QueueTone;
  icon: LucideIcon;
  label: string;
  value: string;
  hint: ReactNode;
}) {
  const alert = tone === "danger";

  return (
    <Link
      href={href}
      className={[
        "admin-card flex flex-col gap-1.5 p-4! transition-[border-color,box-shadow] hover:border-primary/25 hover:shadow-[0_4px_16px_-8px_rgba(8,53,81,0.2)]",
        alert ? "border-red-300/70" : "",
      ].join(" ")}
    >
      <span className={`flex items-center gap-1.5 text-xs ${alert ? "font-medium text-red-700" : "text-ink-muted"}`}>
        <Icon size={14} strokeWidth={1.75} aria-hidden className="shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
        <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${QUEUE_DOT[tone]}`} aria-hidden />
      </span>
      <span
        className={`text-[26px] font-medium leading-tight tracking-tight tabular-nums ${
          alert ? "text-red-600" : "text-ink"
        }`}
      >
        {value}
      </span>
      <span className="truncate text-[11.5px] text-ink-muted">{hint}</span>
    </Link>
  );
}

function MonthFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-[22px] font-medium leading-tight tracking-tight tabular-nums text-ink">{value}</dd>
    </div>
  );
}
