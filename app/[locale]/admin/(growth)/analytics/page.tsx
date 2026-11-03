/**
 * app/[locale]/admin/(growth)/analytics/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Analytics & Reports — the one screen that answers "how is the site
 * doing" without opening GA4 separately (lib/analytics.ts's page views are
 * client-side events this application cannot read back; see that file's
 * header and app/api/page-view/route.ts's for why this screen reads its
 * own PathHitDay counters instead).
 *
 * THE ONE PLACE REPORTS LIVE
 *
 * It is now literally the one place, which it was not before: the
 * dashboard drew the monthly trend, the source breakdown, the pipeline
 * funnel and conversion-by-project from the same lib/reports.ts functions
 * this page calls, over a window the dashboard's `?range=` could move and
 * this page's hardcoded 12 months could not. Two screens, same question,
 * answers that could differ for no reason a reader could see.
 *
 * So this page took the reports and the control that scopes them. The
 * range picker and CSV export are the dashboard's DashboardControls,
 * moved rather than rewritten, and `?range=` now means the same thing here
 * it used to mean there. Event RSVPs and the cookie-consent rate came
 * across with them — they lived only on the dashboard, so dropping them
 * would have removed them from the back office entirely.
 *
 * The tabs, reusing rather than re-deriving every number:
 *   Traffic  — Search Console's Performance report, live
 *              (lib/seo/search-performance.ts, components/admin/
 *              SearchPerformancePanel.tsx), then lib/admin/analytics.ts's
 *              page-view trend: the site's own count of every public page.
 *              Whether GA4, Meta Pixel and Search Console are configured
 *              used to be three tiles here; Settings → Integrations shows
 *              those values as fields.
 *   Content  — lib/admin/news-list.ts's views-vs-leads pairing per
 *              article, lib/reports.ts's conversion-by-project and event
 *              RSVP fill rates, and lib/company-stats.ts's four public-site
 *              headline figures.
 *   Leads    — lib/reports.ts's monthly/source/pipeline reports plus
 *              getWeekOverWeekLeads(). Gated on viewAllLeads, same rule as
 *              everywhere else CRM data shows.
 *
 * Role.ADMIN — the (growth) zone's floor, and since the translation report
 * left for the publishing hub there is no longer an exception to it
 * anywhere in the zone. A role that meets
 * viewAllLeads without meeting ADMIN (SALES) never reaches this page at
 * all, which is why the Leads tab's own capability check is a second,
 * defence-in-depth answer to a question the zone guard already settled —
 * see lib/admin/guard.ts's header for why that repetition is deliberate.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { can } from "@/lib/permissions";
import { isDatabaseOffline } from "@/lib/db";
import { getPageViewTrend } from "@/lib/admin/analytics";
import { getNewsList, parseFilters } from "@/lib/admin/news-list";
import {
  getMonthlyLeads,
  getLeadsBySource,
  getProjectConversions,
  getLeadPipeline,
  getWeekOverWeekLeads,
  getEventRsvpSummary,
  FUNNEL_STAGES,
} from "@/lib/reports";
import { getCookieConsentStats } from "@/lib/cookie-consent-stats";
import { getCompanyStats } from "@/lib/company-stats";
import { intlLocale } from "@/lib/format";
import AnalyticsTabs from "@/components/admin/AnalyticsTabs";
import type { SearchPanelLabels } from "@/components/admin/SearchPerformancePanel";
import { BREAKDOWNS, RANGES, SEARCH_TYPES } from "@/lib/seo/search-performance-shape";
import { fetchLiveSnapshot } from "./live-actions";
import { getVitalsOverview, getConsentCoverage, type VitalFigure } from "@/lib/analytics/vitals-report";
import { formatVital, type VitalKey } from "@/lib/analytics/vitals";
import AnalyticsHeaderControls, { ANALYTICS_RANGES, type AnalyticsRange } from "@/components/admin/AnalyticsHeaderControls";
import Link from "next/link";
import { BarChart3, KeyRound, Megaphone, Search as SearchIcon } from "lucide-react";
import { getGoogleConfig } from "@/lib/google-config";
import { getSiteSettings } from "@/lib/settings";
import { getMetaLeads } from "@/lib/analytics/meta-leads";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import { zoneEyebrow } from "@/lib/admin/nav";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string; compare?: string }>;
};

type AdminT = Awaited<ReturnType<typeof getTranslations<"admin">>>;

/**
 * The Google Search panel's words. The three with placeholders are read
 * raw: the panel fills them in itself, and t() would format them here with
 * nothing to put in the braces.
 */
function searchPanelLabels(t: AdminT): SearchPanelLabels {
  const s = (key: string) => t(`analytics.search.${key}` as never);
  const raw = (key: string) => t.raw(`analytics.search.${key}` as never) as string;
  const pick = <K extends string>(group: string, keys: readonly K[]) =>
    Object.fromEntries(keys.map((key) => [key, s(`${group}.${key}`)])) as Record<K, string>;

  return {
    title: s("title"),
    subtitle: s("subtitle"),
    property: s("property"),
    updated: s("updated"),
    fresh: s("fresh"),
    hourlyNote: s("hourlyNote"),
    ranges: pick("ranges", RANGES),
    more: s("more"),
    types: pick("types", SEARCH_TYPES),
    searchType: s("searchType"),
    metrics: pick("metrics", ["clicks", "impressions", "ctr", "position"] as const),
    vsPrevious: s("vsPrevious"),
    tabs: pick("tabs", BREAKDOWNS),
    devices: pick("devices", ["DESKTOP", "MOBILE", "TABLET"] as const),
    filterQuery: s("filterQuery"),
    filterPage: s("filterPage"),
    filterCountry: s("filterCountry"),
    filterDevice: s("filterDevice"),
    addFilter: s("addFilter"),
    apply: s("apply"),
    reset: s("reset"),
    searchRows: s("searchRows"),
    rowsPerPage: s("rowsPerPage"),
    pageOf: raw("pageOf"),
    export: s("export"),
    empty: s("empty"),
    loading: s("loading"),
    withheld: raw("withheld"),
    truncated: s("truncated"),
    appearanceNote: s("appearanceNote"),
    notConfigured: s("notConfigured"),
    notConfiguredHint: s("notConfiguredHint"),
    noAccess: s("noAccess"),
    noAccessHint: raw("noAccessHint"),
    failed: s("failed"),
    clickToFilter: s("clickToFilter"),
  };
}

function toFigureView(figure: VitalFigure, samplesLabel: (count: number) => string) {
  return {
    metric: figure.metric,
    display: formatVital(figure.metric as VitalKey, figure.value),
    rating: figure.rating,
    samples: samplesLabel(figure.sampleCount),
    enoughSamples: figure.enoughSamples,
  };
}

export default async function AdminAnalyticsPage(props: Props) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;

  const session = await requireAdmin(locale, Role.ADMIN);
  const canViewLeads = can(session.role, "viewAllLeads");

  const t = await getTranslations({ locale, namespace: "admin" });

  /** Stays on the server — only its output crosses into VitalsPanel. */
  const vitalsSamples = (count: number) => t("analytics.vitals.samples", { count });

  const range: AnalyticsRange = (ANALYTICS_RANGES as readonly string[]).includes(searchParams.range ?? "")
    ? (searchParams.range as AnalyticsRange)
    : "28";
  const compare = searchParams.compare === "1";
  const rangeDays = range;
  // Same rounding the dashboard used when it owned this control: the source
  // and conversion reports bucket by month, so a day count becomes the
  // number of months it reaches back into — "7" and "30" both mean this
  // month, "365" the full 12-month window.
  const rangeMonths = Math.max(1, Math.ceil(Number(rangeDays) / 30));

  const [google, settings, metaLeads] = await Promise.all([
    getGoogleConfig(),
    getSiteSettings(),
    getMetaLeads(Number(range)),
  ]);
  const ga4Connected = Boolean(google.credentials && google.ga4PropertyId);
  const gscConnected = Boolean(google.credentials && google.gscSiteUrl);
  const pixelId = settings.analytics.metaPixelId?.trim() || null;
  const integrations = `/${locale}/admin/settings/integrations`;

  const [trend, topArticlesView, conversions, companyStats, eventRsvp, cookieStats, leadsData, vitals, vitalsCoverage] =
    await Promise.all([
      getPageViewTrend(),
      getNewsList({ ...parseFilters({}), sort: "views", perPage: 10 }),
      getProjectConversions(locale, rangeMonths),
      getCompanyStats(),
      getEventRsvpSummary(locale, 6),
      getCookieConsentStats(),
      canViewLeads
        ? Promise.all([
            getMonthlyLeads(12),
            getLeadsBySource(rangeMonths),
            getLeadPipeline(),
            getWeekOverWeekLeads(),
          ])
        : Promise.resolve(null),
      getVitalsOverview(Number(rangeDays)),
      getConsentCoverage(Number(rangeDays)),
    ]);

  const offline = isDatabaseOffline();

  const dayFormat = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" });
  const monthFormat = new Intl.DateTimeFormat(intlLocale(locale), { month: "short", year: "2-digit" });
  const rsvpDateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const trendPoints = trend.days.map((point) => ({
    label: dayFormat.format(new Date(`${point.day}T00:00:00Z`)),
    count: point.count,
  }));

  const [monthly, bySource, pipeline, weekOverWeek] = leadsData ?? [[], [], null, null];

  const funnelStages = pipeline
    ? pipeline.stages.filter((stage) => (FUNNEL_STAGES as string[]).includes(stage.status))
    : [];
  const maxFunnelCount = Math.max(...funnelStages.map((stage) => stage.count), 1);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={zoneEyebrow((key) => t(key as never), "analytics")}
        title={t("analytics.hub.title")}
        description={t("analytics.hub.subtitle")}
        actions={
          <AnalyticsHeaderControls
            locale={locale}
            range={range}
            compare={compare}
            labels={{
              ranges: {
                "1": t("analytics.hub.range1"),
                "7": t("analytics.hub.range7"),
                "28": t("analytics.hub.range28"),
                "90": t("analytics.hub.range90"),
              },
              compare: t("analytics.hub.compare"),
              export: t("analytics.hub.export"),
            }}
          />
        }
      />

      {/* What is connected, at a glance, each with a way to fix it. */}
      <div className="grid gap-3 lg:grid-cols-3">
        {[
          {
            key: "ga4",
            icon: <BarChart3 size={17} aria-hidden />,
            title: "Google Analytics 4",
            on: ga4Connected,
            detail: ga4Connected ? google.ga4PropertyId : null,
            action: t("analytics.hub.setup"),
          },
          {
            key: "gsc",
            icon: <SearchIcon size={17} aria-hidden />,
            title: "Google Search Console",
            on: gscConnected,
            detail: gscConnected ? google.gscSiteUrl : null,
            action: t("analytics.hub.setup"),
          },
          {
            key: "meta",
            icon: <Megaphone size={17} aria-hidden />,
            title: "Meta Pixel + Conversions API",
            on: Boolean(pixelId),
            detail: pixelId,
            action: pixelId ? t("analytics.hub.setup") : t("analytics.hub.connect"),
          },
        ].map((card) => (
          <div key={card.key} className="admin-card flex items-center gap-3 py-3.5!">
            <span className="text-adm-muted">{card.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-adm-text">{card.title}</p>
              <p className={`truncate text-xs ${card.on ? "text-adm-success" : "text-adm-muted"}`}>
                {card.on ? t("analytics.hub.connected") : t("analytics.hub.notConnected")}
                {card.detail ? ` · ${card.detail}` : ""}
              </p>
            </div>
            <Link href={integrations} className="shrink-0 text-sm font-medium text-adm-text hover:underline">
              {card.action}
            </Link>
          </div>
        ))}
      </div>

      {offline && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      <AnalyticsTabs
        locale={locale}
        canViewLeads={canViewLeads}
        range={range}
        compare={compare}
        ga={{
          labels: Object.fromEntries(
            Object.entries(t.raw("analytics.ga") as Record<string, string>).map(([key, value]) => [key, value]),
          ),
        }}
        metaPanel={
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: t("analytics.meta.pixel"), value: pixelId ?? t("analytics.hub.notConnected") },
                { label: t("analytics.meta.leadsFromMeta", { days: range === "1" ? 1 : Number(range) }), value: `${metaLeads.fromMeta} / ${metaLeads.total}` },
                { label: t("analytics.meta.paid"), value: String(metaLeads.paid) },
              ].map((kpi) => (
                <div key={kpi.label} className="admin-card py-4!">
                  <p className="text-xs text-adm-muted">{kpi.label}</p>
                  <p className="mt-1 truncate text-xl font-semibold text-adm-text">{kpi.value}</p>
                </div>
              ))}
            </div>
            <section className="admin-card p-0!">
              <h3 className="border-b border-adm-line px-5 py-3 text-sm font-semibold text-adm-text">{t("analytics.meta.campaigns")}</h3>
              {metaLeads.campaigns.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-adm-muted">{t("analytics.meta.noCampaigns")}</p>
              ) : (
                <ul>
                  {metaLeads.campaigns.map((row) => (
                    <li key={row.name} className="flex justify-between border-b border-adm-line px-5 py-2.5 text-sm last:border-b-0">
                      <span className="text-adm-text">{row.name}</span>
                      <span className="tabular-nums text-adm-text">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <p className="text-xs text-adm-muted">{t("analytics.meta.note")}</p>
          </div>
        }
        apiPanel={
          <section className="admin-card space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-adm-text">
              <KeyRound size={15} aria-hidden />
              {t("analytics.api.title")}
            </h3>
            <ul className="space-y-3 text-sm">
              {[
                { name: "GA4 Measurement ID", on: Boolean(settings.analytics.gaMeasurementId), value: settings.analytics.gaMeasurementId },
                { name: "GA4 Data API", on: ga4Connected, value: google.ga4PropertyId },
                { name: "Search Console API", on: gscConnected, value: google.gscSiteUrl },
                { name: "Service account", on: Boolean(google.credentials), value: google.credentials?.email ?? null },
                { name: "Meta Pixel", on: Boolean(pixelId), value: pixelId },
                { name: "Meta Conversions API", on: false, value: null },
              ].map((row) => (
                <li key={row.name} className="flex flex-wrap items-center justify-between gap-2 border-b border-adm-line pb-3 last:border-b-0 last:pb-0">
                  <span className="font-medium text-adm-text">{row.name}</span>
                  <span className={`text-xs ${row.on ? "text-adm-success" : "text-adm-muted"}`}>
                    {row.on ? `${t("analytics.hub.connected")}${row.value ? ` · ${row.value}` : ""}` : t("analytics.hub.notConnected")}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-adm-muted">{t("analytics.api.note")}</p>
            <Link href={integrations} className="admin-btn w-fit">
              {t("analytics.api.open")}
            </Link>
          </section>
        }
        vitals={{
          overall: vitals.overall.map((group) => ({
            device: group.device,
            figures: group.figures.map((figure) => toFigureView(figure, vitalsSamples)),
          })),
          routes: vitals.routes.map((route) => ({
            path: route.path,
            device: route.device,
            figures: route.figures.map((figure) => toFigureView(figure, vitalsSamples)),
          })),
          deploys: vitals.deploys,
          empty: vitals.empty,
          labels: {
            title: t("analytics.vitals.title"),
            subtitle: t("analytics.vitals.subtitle"),
            empty: t("analytics.vitals.empty"),
            emptyHint: t("analytics.vitals.emptyHint"),
            // Worded here, where the percentage is known, rather than passed
            // as a number and a formatter — see toFigureView above.
            coverage:
              vitalsCoverage === null
                ? t("analytics.vitals.coverageUnknown")
                : t("analytics.vitals.coverage", { percent: vitalsCoverage }),
            ratings: {
              good: t("analytics.vitals.ratingGood"),
              needsImprovement: t("analytics.vitals.ratingNeedsImprovement"),
              poor: t("analytics.vitals.ratingPoor"),
            },
            notEnough: t("analytics.vitals.notEnough"),
            devices: {
              mobile: t("analytics.vitals.mobile"),
              desktop: t("analytics.vitals.desktop"),
            },
            routesTitle: t("analytics.vitals.routesTitle"),
            routesHint: t("analytics.vitals.routesHint"),
            pageHeader: t("analytics.vitals.pageHeader"),
            deploysTitle: t("analytics.vitals.deploysTitle"),
            deploysHint: t("analytics.vitals.deploysHint"),
            metricHints: {
              LCP: t("analytics.vitals.hintLcp"),
              INP: t("analytics.vitals.hintInp"),
              CLS: t("analytics.vitals.hintCls"),
              TTFB: t("analytics.vitals.hintTtfb"),
            },
          },
        }}
        realtime={{
          fetchSnapshot: fetchLiveSnapshot,
          labels: {
            title: t("analytics.realtime.title"),
            subtitle: t("analytics.realtime.subtitle"),
            activeNow: t("analytics.realtime.activeNow"),
            empty: t("analytics.realtime.empty"),
            emptyHint: t("analytics.realtime.emptyHint"),
            failed: t("analytics.realtime.failed"),
            stale: t("analytics.realtime.stale"),
            pagesTitle: t("analytics.realtime.pagesTitle"),
            pageHeader: t("analytics.realtime.pageHeader"),
            readersHeader: t("analytics.realtime.readersHeader"),
            medianDwellHeader: t("analytics.realtime.medianDwellHeader"),
            feedTitle: t("analytics.realtime.feedTitle"),
            feedArrived: t("analytics.realtime.feedArrived"),
            feedMoved: t("analytics.realtime.feedMoved"),
            feedLeft: t("analytics.realtime.feedLeft"),
            localeTitle: t("analytics.realtime.localeTitle"),
            refresh: t("analytics.realtime.refresh"),
            /* Formatted here so the units stay translated — the panel is a
               client component and does no arithmetic of its own, matching
               how every other number on this screen arrives. */
          },
        }}
        search={{ labels: searchPanelLabels(t) }}
        traffic={{
          trend: trendPoints,
          totalViews: trend.totalViews,
          countingSince: trend.countingSince,
          cookieConsent: {
            total: cookieStats.total,
            analyticsRate: cookieStats.analyticsRate,
            marketingRate: cookieStats.marketingRate,
          },
        }}
        content={{
          topArticles: topArticlesView.rows.map((row) => ({
            id: row.id,
            title: row.title,
            views30: row.views30,
            leads: row.leads,
          })),
          conversions: conversions.map((row) => ({
            projectId: row.projectId,
            name: row.name,
            total: row.total,
            worked: row.worked,
            won: row.won,
            rate: row.rate,
          })),
          /* Pre-formatted here rather than in the client component: the
             seat count is an ICU plural pair and the date is locale-aware,
             and AnalyticsTabs deliberately does no arithmetic and no
             localisation of its own. */
          eventRsvp: eventRsvp.map((event) => ({
            eventId: event.eventId,
            title: event.title,
            startsAt: event.startsAt.toISOString(),
            dateLabel: rsvpDateFormat.format(event.startsAt),
            fillRate: event.fillRate,
            seatsLabel:
              event.capacity !== null
                ? t("reports.rsvp.filled", {
                    registered: event.registered,
                    capacity: event.capacity,
                  })
                : t("reports.rsvp.registeredOnly", { registered: event.registered }),
          })),
          companyStats,
        }}
        leads={{
          monthly: monthly.map((point) => ({
            label: monthFormat.format(new Date(`${point.month}-01T00:00:00Z`)),
            total: point.total,
            won: point.won,
          })),
          bySource: bySource.map((slice) => ({
            label: t(`leadSource.${slice.source}` as never),
            count: slice.count,
          })),
          funnel: funnelStages.map((stage) => ({
            status: stage.status,
            label: t(`leadStatus.${stage.status}` as never),
            count: stage.count,
            isBottleneck: pipeline?.bottleneck?.status === stage.status,
          })),
          maxFunnelCount,
          weekOverWeek: weekOverWeek ?? { thisWeek: 0, lastWeek: 0, changePercent: null },
        }}
        labels={{
          tab_now: t("analytics.tabs.now"),
          tab_real: t("analytics.tabs.real"),
          tab_ga: t("analytics.tabs.ga"),
          tab_search: t("analytics.tabs.search"),
          tab_meta: t("analytics.tabs.meta"),
          tab_api: t("analytics.tabs.api"),
          totalViewsHint: t("analytics.totalViewsHint"),
          trendTitle: t("analytics.trendTitle"),
          trendSubtitle: t("analytics.trendSubtitle"),
          views: t("analytics.views"),
          empty: t("common.empty"),
          projectsDelivered: t("analytics.projectsDelivered"),
          awardsWon: t("analytics.awardsWon"),
          villasInBuild: t("analytics.villasInBuild"),
          foundedYear: t("analytics.foundedYear"),
          topArticlesTitle: t("analytics.topArticlesTitle"),
          article: t("analytics.article"),
          views30: t("analytics.views30"),
          leadsFromArticle: t("analytics.leadsFromArticle"),
          conversionTitle: t("reports.conversion.title"),
          conversionSubtitle: t("reports.conversion.subtitle"),
          project: t("projects.name"),
          total: t("reports.monthly.total"),
          worked: t("reports.conversion.worked"),
          won: t("reports.monthly.won"),
          rate: t("reports.conversion.rate"),
          notWorked: t("reports.conversion.notWorked"),
          weekOverWeek: t("analytics.weekOverWeek"),
          /*
            Formatted here, with the number, rather than handed down as a
            template for the client to patch.

            AnalyticsTabs used to do the substitution itself with
            .replace("{lastWeek}", …), which cannot work: next-intl formats
            the message at t() time, and a call with no values for a
            placeholder it carries logs a FORMATTING_ERROR and falls back
            to the key path. The client then ran .replace() over the
            literal string "admin.analytics.weekOverWeekHint", found no
            placeholder, and printed it — which is what the Leads tab
            showed in all four languages from 2026-09-18.
          */
          weekOverWeekHint: t("analytics.weekOverWeekHint", {
            lastWeek: weekOverWeek?.lastWeek ?? 0,
          }),
          monthlyTitle: t("reports.monthly.title"),
          monthlySubtitle: t("reports.monthly.subtitle"),
          sourcesTitle: t("reports.sources.title"),
          sourcesSubtitle: t("reports.sources.subtitle"),
          pipelineTitle: t("reports.pipeline.title"),
          pipelineSubtitle: t("reports.pipeline.subtitle"),
          bottleneck: t("reports.pipeline.bottleneckFlag"),
          rsvpTitle: t("reports.rsvp.title"),
          rsvpSubtitle: t("reports.rsvp.subtitle"),
          cookieConsentTitle: t("reports.cookieConsent.title"),
          cookieConsentSubtitle: t("reports.cookieConsent.subtitle", { total: cookieStats.total }),
          cookieConsentAnalytics: t("reports.cookieConsent.analytics"),
          cookieConsentMarketing: t("reports.cookieConsent.marketing"),
          cookieConsentTotal: t("reports.cookieConsent.total"),
        }}
      />
    </div>
  );
}
