/**
 * app/[locale]/admin/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Dashboard — "งานวันนี้": what needs doing today, and the few numbers
 * that say whether it is going well.
 *
 * WHAT THIS PAGE USED TO BE, AND WHY IT IS NOT THAT ANY MORE
 *
 * It drew seven reports, four of them the same charts /admin/analytics
 * already drew from the same lib/reports.ts functions, so the two screens
 * answered one question twice and could disagree whenever their windows
 * differed. Every report lives at /admin/analytics now. What stays here is
 * work and the reason to do it:
 *
 *   · the daily brief — a sentence from today's counts, and a tile per
 *     backlog that opens the list already filtered to it;
 *   · four KPI cards, each a link into where the number comes from;
 *   · the work inbox — unassigned leads, appointments nobody closed and
 *     content with no Thai, oldest first, each with its next step as a
 *     button and an undo instead of a confirm (components/admin/WorkInbox);
 *   · the pipeline, unit stock per project, who is on the site, the
 *     tracked keywords and the audit log's latest changes.
 *
 * WHO SEES WHAT
 *
 * Every panel is asked of the nav config (canSeeItem), the same rule the
 * sidebar draws from: a role gets a panel only if it could open the screen
 * the panel summarises, and its loader is not even called otherwise. That
 * matters most for the inbox — lead names are PDPA data, and the "latest
 * leads" list this page used to draw showed them to editors and viewers
 * who cannot open a single lead. Aggregate numbers (the KPI cards, stock)
 * are shown to everyone and are links only where the destination admits
 * the role.
 *
 * All reads go through safeQuery (lib/admin/dashboard.ts), so a database
 * blip empties panels rather than returning a 500.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, ArrowDown, ArrowUp, ImageOff } from "lucide-react";
import { Role, type LeadStatus, type ProjectStatus } from "@prisma/client";
import { RESPONSE_SLA_HOURS } from "@/lib/dashboard-queue";
import {
  getLeadArrivals,
  getLeadStatusCounts,
  getOpenLeadCount,
  getOverdueAppointments,
  getProjectStock,
  getRecentActivity,
  getTodayEvents,
  getTopKeywords,
  getUnassignedLeads,
} from "@/lib/admin/dashboard";
import {
  FUNNEL_STAGES,
  ageParts,
  dailySeries,
  rankDelta,
  sortInbox,
  type InboxItem,
  type InboxKind,
} from "@/lib/admin/dashboard-model";
import { getCookieConsentStats } from "@/lib/cookie-consent-stats";
import { getPageViewTrend } from "@/lib/admin/analytics";
import { getTranslationStatusReport } from "@/lib/locale-completeness";
import { EMPTY_SNAPSHOT, getLiveSnapshot } from "@/lib/analytics/live-visit";
import { AUTH_LOGIN, AUTH_LOGOUT } from "@/lib/audit/events";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { canSeeItem } from "@/lib/admin/nav";
import { intlLocale } from "@/lib/format";
import DailyBrief, { type BriefTile } from "@/components/admin/DailyBrief";
import KpiCard from "@/components/admin/KpiCard";
import Sparkline from "@/components/admin/Sparkline";
import WorkInbox from "@/components/admin/WorkInbox";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ denied?: string }>;
};

/** Window for the leads sparkline and the page-view total. */
const LEAD_DAYS = 14;
const VIEW_DAYS = 30;
const INBOX_CONTENT_TAKE = 12;

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

const EMPTY_QUEUE = { count: 0, rows: [] };

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

  const can = {
    leads: canSeeItem(session.role, "leads"),
    pages: canSeeItem(session.role, "pages"),
    events: canSeeItem(session.role, "events"),
    projects: canSeeItem(session.role, "projects"),
    analytics: canSeeItem(session.role, "analytics"),
    seo: canSeeItem(session.role, "seo"),
    activity: canSeeItem(session.role, "activity"),
  };

  const t = await getTranslations({ locale, namespace: "admin" });
  const now = new Date();

  const [
    unassigned,
    overdue,
    todayEvents,
    openLeads,
    arrivals,
    views,
    consent,
    stock,
    funnel,
    translations,
    live,
    keywords,
    activity,
  ] = await Promise.all([
    can.leads ? getUnassignedLeads() : EMPTY_QUEUE,
    can.leads ? getOverdueAppointments(session) : EMPTY_QUEUE,
    can.events ? getTodayEvents() : [],
    getOpenLeadCount(),
    getLeadArrivals(LEAD_DAYS),
    getPageViewTrend(VIEW_DAYS),
    getCookieConsentStats(),
    getProjectStock(),
    can.leads ? getLeadStatusCounts() : ({} as Partial<Record<LeadStatus, number>>),
    can.pages ? getTranslationStatusReport() : null,
    can.analytics ? safeQuery("dashboard:live", getLiveSnapshot, EMPTY_SNAPSHOT) : null,
    can.seo ? getTopKeywords() : [],
    can.activity ? getRecentActivity() : [],
  ]);

  const offline = isDatabaseOffline();
  const base = `/${locale}/admin`;
  const numberFormat = new Intl.NumberFormat(intlLocale(locale));
  const n = (value: number) => numberFormat.format(value);
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const relative = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const ago = (at: Date) => {
    const { unit, value } = ageParts(at, now);
    return relative.format(-value, unit);
  };
  const ageLabel = (at: Date) => {
    const { unit, value } = ageParts(at, now);
    return t(`dashboard.inbox.age.${unit}`, { value });
  };
  const localName = (row: { nameEn: string; nameTh: string }) =>
    locale === "th" && row.nameTh ? row.nameTh : row.nameEn;

  // ── Daily brief ──────────────────────────────────────────────────────
  const oldestLead = unassigned.rows[0]?.createdAt ?? null;
  const oldestLeadHours = oldestLead ? Math.floor((now.getTime() - oldestLead.getTime()) / 3_600_000) : null;
  const firstEvent = todayEvents[0];

  const tiles: BriefTile[] = [];
  const sentenceParts: string[] = [];

  if (can.leads) {
    tiles.push({
      key: "leads",
      href: `${base}/leads?assignedTo=unassigned`,
      label: t("dashboard.brief.tiles.leads"),
      value: n(unassigned.count),
      hint:
        oldestLeadHours === null
          ? t("dashboard.brief.tiles.leadsNone")
          : t("dashboard.brief.tiles.leadsOldest", { hours: oldestLeadHours }),
      alert: oldestLeadHours !== null && oldestLeadHours >= RESPONSE_SLA_HOURS,
    });
    tiles.push({
      key: "overdue",
      href: `${base}/appointments`,
      label: t("dashboard.brief.tiles.overdue"),
      value: n(overdue.count),
      hint: overdue.count > 0 ? t("dashboard.brief.tiles.overdueHint") : t("dashboard.brief.tiles.overdueNone"),
      alert: overdue.count > 0,
    });
    if (unassigned.count > 0) sentenceParts.push(t("dashboard.brief.parts.leads", { count: unassigned.count }));
    if (overdue.count > 0) sentenceParts.push(t("dashboard.brief.parts.overdue", { count: overdue.count }));
  }

  if (can.events) {
    tiles.push({
      key: "events",
      href: `${base}/events`,
      label: t("dashboard.brief.tiles.events"),
      value: n(todayEvents.length),
      hint: !firstEvent
        ? t("dashboard.brief.tiles.eventsNone")
        : firstEvent.capacity === null
          ? t("dashboard.brief.tiles.eventsOpen", {
              title: locale === "th" ? firstEvent.titleTh : firstEvent.titleEn,
              taken: firstEvent.seatsTaken,
            })
          : t("dashboard.brief.tiles.eventsSeats", {
              title: locale === "th" ? firstEvent.titleTh : firstEvent.titleEn,
              taken: firstEvent.seatsTaken,
              capacity: firstEvent.capacity,
            }),
    });
    if (todayEvents.length > 0) sentenceParts.push(t("dashboard.brief.parts.events", { count: todayEvents.length }));
  }

  const sentence =
    sentenceParts.length > 0
      ? t("dashboard.brief.waiting", { list: sentenceParts.join(" · ") })
      : t("dashboard.brief.allClear");

  // ── Work inbox ───────────────────────────────────────────────────────
  const contentGaps = (translations?.groups ?? []).flatMap((group) =>
    group.items.filter((item) => item.missingLocales.includes("th")).map((item) => ({ ...item, group: group.group })),
  );

  const inboxItems: InboxItem[] = sortInbox([
    ...unassigned.rows.map((lead) => {
      const hours = (now.getTime() - lead.createdAt.getTime()) / 3_600_000;
      return {
        key: `lead:${lead.id}`,
        kind: "lead" as const,
        id: lead.id,
        title: lead.name,
        detail: [lead.project ? localName(lead.project) : t("leads.noProject"), t(`leadSource.${lead.source}` as never)].join(
          " · ",
        ),
        since: lead.createdAt.toISOString(),
        ageLabel: ageLabel(lead.createdAt),
        late: hours >= RESPONSE_SLA_HOURS,
        href: `${base}/leads?lead=${lead.id}`,
      };
    }),
    ...overdue.rows.map((appointment) => ({
      key: `appointment:${appointment.id}`,
      kind: "appointment" as const,
      id: appointment.id,
      title: appointment.lead?.name ?? t("dashboard.inbox.noCustomer"),
      detail: [
        t("dashboard.inbox.appointmentDue", { when: dateFormat.format(appointment.scheduledAt) }),
        appointment.project ? localName(appointment.project) : null,
      ]
        .filter(Boolean)
        .join(" · "),
      since: appointment.scheduledAt.toISOString(),
      ageLabel: ageLabel(appointment.scheduledAt),
      // Already past its time by definition — that is why it is here.
      late: true,
      href: `${base}/appointments`,
    })),
    ...contentGaps.slice(0, INBOX_CONTENT_TAKE).map((gap) => ({
      key: `content:${gap.group}:${gap.id}`,
      kind: "content" as const,
      id: gap.id,
      title: gap.label,
      detail: t("dashboard.inbox.missingThai"),
      since: null,
      ageLabel: null,
      late: false,
      href: `${base}${gap.editHref}`,
    })),
  ]);

  const inboxKinds: InboxKind[] = [
    ...(can.leads ? (["lead", "appointment"] as const) : []),
    ...(can.pages ? (["content"] as const) : []),
  ];

  // ── KPIs ─────────────────────────────────────────────────────────────
  const arrivalSeries = dailySeries(arrivals, LEAD_DAYS, now);
  // The analytics page's own trend, so the two screens cannot disagree
  // about how many views the last 30 days had.
  const viewSeries = views.days.map((day) => day.count);
  const viewTotal = views.totalViews;
  const units = stock.reduce(
    (sum, row) => ({
      available: sum.available + row.available,
      reserved: sum.reserved + row.reserved,
      sold: sum.sold + row.sold,
      total: sum.total + row.total,
    }),
    { available: 0, reserved: 0, sold: 0, total: 0 },
  );

  /* The same lookup /admin/activity uses, falling back to the stored
     string rather than to "edited" — see the note on actionLabels there.
     Sign-ins are filtered out of this panel, but mapped anyway so a label
     never depends on that filter. */
  const activityVerbs: Record<string, string> = {
    create: t("activity.actionCreate"),
    update: t("activity.actionUpdate"),
    delete: t("activity.actionDelete"),
    [AUTH_LOGIN]: t("activity.actionLogin"),
    [AUTH_LOGOUT]: t("activity.actionLogout"),
  };

  // ── Funnel ───────────────────────────────────────────────────────────
  const funnelMax = Math.max(1, ...FUNNEL_STAGES.map((stage) => funnel[stage] ?? 0));

  return (
    <div className="space-y-4">
      {/* Set by requireAdmin() when a page demanded a higher role. */}
      {searchParams.denied && (
        <p className="rounded-control border border-adm-danger/30 bg-adm-danger-bg px-4 py-3 text-sm text-adm-danger">
          {t("common.denied")}
        </p>
      )}

      {offline && (
        <p className="rounded-control border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      <DailyBrief
        chip={t("dashboard.brief.chip")}
        greeting={t(`dashboard.${timeOfDayGreetingKey(now)}`, { name: session.name })}
        sentence={sentence}
        tiles={tiles}
      />

      {/* ── KPIs ───────────────────────────────────────────────────── */}
      <section aria-label={t("dashboard.kpi.title")} className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          href={can.leads ? `${base}/leads` : null}
          label={t("dashboard.kpi.openLeads")}
          value={n(openLeads)}
          hint={t("dashboard.kpi.openLeadsHint", {
            count: arrivalSeries.reduce((sum, value) => sum + value, 0),
            days: LEAD_DAYS,
          })}
          visual={<Sparkline values={arrivalSeries} />}
        />
        <KpiCard
          href={can.projects ? `${base}/projects` : null}
          label={t("dashboard.kpi.units")}
          value={`${n(units.available)} / ${n(units.total)}`}
          hint={t("dashboard.kpi.unitsHint", { reserved: units.reserved, sold: units.sold })}
          visual={units.total > 0 ? <StockBar {...units} /> : undefined}
        />
        <KpiCard
          href={can.analytics ? `${base}/analytics` : null}
          label={t("dashboard.kpi.pageViews")}
          value={n(viewTotal)}
          hint={t("dashboard.kpi.pageViewsHint", { days: VIEW_DAYS })}
          visual={<Sparkline values={viewSeries} />}
        />
        <KpiCard
          href={can.analytics ? `${base}/analytics` : null}
          label={t("dashboard.kpi.consent")}
          value={consent.analyticsRate === null ? "—" : `${consent.analyticsRate}%`}
          hint={
            consent.analyticsRate === null
              ? t("dashboard.kpi.consentNone")
              : t("dashboard.kpi.consentHint", { total: consent.total })
          }
          visual={
            consent.analyticsRate === null ? undefined : (
              <span className="block h-1.5 overflow-hidden rounded-full bg-adm-line">
                <span className="block h-full rounded-full bg-current" style={{ width: `${consent.analyticsRate}%` }} />
              </span>
            )
          }
        />
      </section>

      {/* grid-flow-dense: a role missing a panel (SALES has no live card)
          would otherwise leave its slot as a hole. */}
      <div className="grid grid-flow-dense grid-cols-12 items-start gap-4">
        {inboxKinds.length > 0 && (
          <Card
            className="col-span-12 xl:col-span-8"
            title={t("dashboard.inbox.title")}
            flush
          >
            <WorkInbox
              locale={locale}
              items={inboxItems}
              totals={{ lead: unassigned.count, appointment: overdue.count, content: contentGaps.length }}
              kinds={inboxKinds}
              currentUserId={session.id}
            />
          </Card>
        )}

        {can.leads && (
          <Card
            className="col-span-12 xl:col-span-4"
            title={t("dashboard.funnel.title")}
            action={<ViewAll href={`${base}/leads`} label={t("dashboard.viewAll")} />}
          >
            <ul className="space-y-2.5">
              {FUNNEL_STAGES.map((stage) => {
                const count = funnel[stage] ?? 0;
                return (
                  <li key={stage}>
                    <Link href={`${base}/leads?status=${stage}`} className="group block">
                      <span className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate text-ink group-hover:text-primary-500">
                          {t(`leadStatus.${stage}` as never)}
                        </span>
                        <span className="tabular-nums text-ink-muted">{n(count)}</span>
                      </span>
                      <span className="block h-2 overflow-hidden rounded-full bg-adm-line">
                        <span
                          className="block h-full rounded-full bg-adm-info"
                          style={{ width: `${(count / funnelMax) * 100}%` }}
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card
          className="col-span-12 xl:col-span-8"
          title={t("dashboard.stock.title")}
          action={
            <span className="flex items-center gap-3 text-[11px] text-ink-muted">
              <LegendDot className="bg-adm-success" label={t("dashboard.inventory.available")} />
              <LegendDot className="bg-adm-fill" label={t("dashboard.inventory.reserved")} />
              <LegendDot className="bg-primary-500" label={t("dashboard.inventory.sold")} />
            </span>
          }
          flush
        >
          {stock.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">{t("dashboard.stock.empty")}</p>
          ) : (
            <ul className="divide-y divide-adm-line">
              {stock.map((project) => (
                <li key={project.id}>
                  <MaybeLink
                    href={can.projects ? `${base}/projects/${project.id}/units` : null}
                    className="flex items-center gap-4 px-5 py-3"
                  >
                    <span className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-surface-muted">
                      {project.imageUrl ? (
                        /* Plain <img>, like every other admin thumbnail:
                           next/image refuses any host missing from
                           remotePatterns and would take the row with it. */
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={project.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff size={16} aria-hidden className="text-ink-muted" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{localName(project)}</span>
                        <ProjectStatusPill
                          status={project.status as ProjectStatus}
                          label={t(`projectStatus.${project.status}` as never)}
                        />
                      </span>
                      <span className="mt-1.5 block">
                        <StockBar {...project} />
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                      {t("dashboard.inventory.freeOfTotal", { free: n(project.available), total: n(project.total) })}
                    </span>
                  </MaybeLink>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {live && (
          <Card
            className="col-span-12 xl:col-span-4"
            title={t("dashboard.live.title")}
            action={<ViewAll href={`${base}/analytics`} label={t("dashboard.viewAll")} />}
          >
            <p className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-tight tabular-nums text-ink">{n(live.activeCount)}</span>
              <span className="text-xs text-ink-muted">{t("dashboard.live.people")}</span>
            </p>
            {live.pages.length === 0 ? (
              <p className="mt-3 text-xs text-ink-muted">{t("dashboard.live.empty")}</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {live.pages.slice(0, 5).map((page) => (
                  <li key={page.path} className="flex items-center justify-between gap-3 text-xs">
                    <span className="admin-mono truncate text-ink">{page.path}</span>
                    <span className="shrink-0 tabular-nums text-ink-muted">{n(page.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {can.seo && (
          <Card
            className="col-span-12 lg:col-span-6"
            title={t("dashboard.keywords.title")}
            action={<ViewAll href={`${base}/seo/keywords`} label={t("dashboard.viewAll")} />}
            flush
          >
            {keywords.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">{t("dashboard.keywords.empty")}</p>
            ) : (
              <ul className="divide-y divide-adm-line">
                {keywords.map((keyword) => {
                  const delta = rankDelta(keyword.currentRank, keyword.previousRank);
                  return (
                    <li key={keyword.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate text-ink">{keyword.phrase}</span>
                      <span className="rounded-full bg-adm-neutral-bg px-2 py-0.5 text-[10.5px] uppercase text-adm-neutral">
                        {keyword.locale}
                      </span>
                      <span className="w-10 text-right tabular-nums font-medium text-ink">#{keyword.currentRank}</span>
                      <RankDelta delta={delta} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {can.activity && (
          <Card
            className="col-span-12 lg:col-span-6"
            title={t("dashboard.activity.title")}
            action={<ViewAll href={`${base}/activity`} label={t("dashboard.viewAll")} />}
            flush
          >
            {activity.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">{t("dashboard.activity.empty")}</p>
            ) : (
              <ul className="divide-y divide-adm-line">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex items-baseline gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-ink">{entry.actorName ?? entry.actorEmail}</span>{" "}
                      <span className="text-ink-muted">{activityVerbs[entry.action] ?? entry.action}</span>{" "}
                      <span className="text-ink">{entry.recordLabel ?? entry.model}</span>
                    </span>
                    <time dateTime={entry.createdAt.toISOString()} className="shrink-0 text-xs text-ink-muted">
                      {ago(entry.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({
  title,
  action,
  className,
  flush = false,
  children,
}: {
  title: string;
  action?: ReactNode;
  className: string;
  /** No body padding — for lists whose rows run edge to edge. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`admin-card overflow-hidden p-0! ${className}`}>
      <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-adm-line px-5 py-2.5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div className={flush ? "pb-2" : "p-5"}>{children}</div>
    </section>
  );
}

function ViewAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-primary">
      {label}
      <ArrowRight size={13} aria-hidden />
    </Link>
  );
}

/** A row that is a link only for a role the destination admits — the same
 *  rule nav.ts applies to the sidebar, so nothing here lands on a denial. */
function MaybeLink({ href, className, children }: { href: string | null; className: string; children: ReactNode }) {
  return href ? (
    <Link href={href} className={`${className} transition-colors hover:bg-primary/5`}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

/** Available · reserved · sold, left to right. Every unit AVAILABLE is a
 *  normal state (it is the state of the data today), and draws one full
 *  green bar rather than an empty one. */
function StockBar({ available, reserved, sold, total }: { available: number; reserved: number; sold: number; total: number }) {
  const pct = (value: number) => `${(value / total) * 100}%`;
  return (
    <span aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-adm-line">
      <span className="bg-adm-success" style={{ width: pct(available) }} />
      <span className="bg-adm-fill" style={{ width: pct(reserved) }} />
      <span className="bg-primary-500" style={{ width: pct(sold) }} />
    </span>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

const PROJECT_STATUS_TONE: Record<ProjectStatus, string> = {
  UPCOMING: "bg-adm-status-info-bg text-adm-status-info",
  UNDER_CONSTRUCTION: "bg-adm-warning-bg text-adm-warning",
  READY_TO_MOVE_IN: "bg-adm-success-bg text-adm-success",
  SOLD_OUT: "bg-adm-neutral-bg text-adm-neutral",
};

function ProjectStatusPill({ status, label }: { status: ProjectStatus; label: string }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${PROJECT_STATUS_TONE[status]}`}>
      {label}
    </span>
  );
}

function RankDelta({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) {
    return <span className="w-10 text-right text-xs text-ink-muted">—</span>;
  }
  const up = delta > 0;
  return (
    <span
      className={`inline-flex w-10 items-center justify-end gap-0.5 text-xs tabular-nums ${
        up ? "text-adm-success" : "text-adm-danger"
      }`}
    >
      {up ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
      {Math.abs(delta)}
    </span>
  );
}
