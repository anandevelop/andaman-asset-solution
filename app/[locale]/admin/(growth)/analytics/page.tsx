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
 * Three tabs, reusing rather than re-deriving every number:
 *   Traffic  — lib/admin/analytics.ts's page-view trend (the one genuinely
 *              new query this page needed), whether GA4/Meta Pixel/Search
 *              Console are configured (lib/settings.ts), and the
 *              cookie-consent rate that decides how much of the first two
 *              ever fire.
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
import { BarChart3 } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { can } from "@/lib/permissions";
import { isDatabaseOffline } from "@/lib/db";
import { getPageViewTrend } from "@/lib/admin/analytics";
import { getSiteSettings } from "@/lib/settings";
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
import { isRangeDays, type RangeDays } from "@/lib/dashboard-range";
import { intlLocale } from "@/lib/format";
import AnalyticsTabs from "@/components/admin/AnalyticsTabs";
import { fetchLiveSnapshot } from "./live-actions";
import DashboardControls from "@/components/admin/DashboardControls";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string }>;
};

/** Whole minutes and seconds, so the message file owns the units. */
function durationParts(ms: number): { minutes: number; seconds: number } {
  const total = Math.max(0, Math.round(ms / 1000));
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

export default async function AdminAnalyticsPage(props: Props) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;

  const session = await requireAdmin(locale, Role.ADMIN);
  const canViewLeads = can(session.role, "viewAllLeads");

  const t = await getTranslations({ locale, namespace: "admin" });

  const rangeDays: RangeDays = isRangeDays(searchParams.range) ? searchParams.range : "30";
  // Same rounding the dashboard used when it owned this control: the source
  // and conversion reports bucket by month, so a day count becomes the
  // number of months it reaches back into — "7" and "30" both mean this
  // month, "365" the full 12-month window.
  const rangeMonths = Math.max(1, Math.ceil(Number(rangeDays) / 30));

  const [trend, settings, topArticlesView, conversions, companyStats, eventRsvp, cookieStats, leadsData] =
    await Promise.all([
      getPageViewTrend(),
      getSiteSettings(),
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="admin-section-title">{t("nav.analytics")}</p>
          <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-semibold text-primary sm:text-3xl">
            <BarChart3 size={22} strokeWidth={1.75} className="text-accent-700" aria-hidden />
            {t("analytics.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("analytics.subtitle")}</p>
        </div>

        {/* The dashboard's own header control, moved here with the reports
            it scopes. The CSV export travels with the range picker because
            it downloads exactly the selected window — see the component's
            header for why the two are one control and not two. */}
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

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <AnalyticsTabs
        locale={locale}
        canViewLeads={canViewLeads}
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
            duration: (ms: number) => t("analytics.realtime.duration", durationParts(ms)),
            ago: (ms: number) => t("analytics.realtime.ago", durationParts(ms)),
          },
        }}
        traffic={{
          trend: trendPoints,
          totalViews: trend.totalViews,
          countingSince: trend.countingSince,
          gaConfigured: settings.analytics.gaMeasurementId.trim().length > 0,
          metaPixelConfigured: settings.analytics.metaPixelId.trim().length > 0,
          searchConsoleConfigured: settings.analytics.googleSiteVerification.trim().length > 0,
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
          tab_realtime: t("analytics.tabs.realtime"),
          tab_traffic: t("analytics.tabs.traffic"),
          tab_content: t("analytics.tabs.content"),
          tab_leads: t("analytics.tabs.leads"),
          totalViews: t("analytics.totalViews"),
          totalViewsHint: t("analytics.totalViewsHint"),
          gaLabel: t("analytics.gaLabel"),
          metaPixelLabel: t("analytics.metaPixelLabel"),
          searchConsoleLabel: t("analytics.searchConsoleLabel"),
          configured: t("analytics.configured"),
          notConfigured: t("analytics.notConfigured"),
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
          weekOverWeekHint: t("analytics.weekOverWeekHint"),
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
        }}
      />
    </div>
  );
}
