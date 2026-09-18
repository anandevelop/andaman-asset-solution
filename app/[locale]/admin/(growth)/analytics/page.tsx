/**
 * app/[locale]/admin/(growth)/analytics/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Analytics & Reports — the one screen that answers "how is the site
 * doing" without opening GA4 separately (lib/analytics.ts's page views are
 * client-side events this application cannot read back; see that file's
 * header and app/api/page-view/route.ts's for why this screen reads its
 * own PathHitDay counters instead).
 *
 * Three tabs, reusing rather than re-deriving every number:
 *   Traffic  — lib/admin/analytics.ts's page-view trend (the one genuinely
 *              new query this page needed) plus whether GA4/Meta Pixel/
 *              Search Console are configured (lib/settings.ts).
 *   Content  — lib/admin/news-list.ts's views-vs-leads pairing per
 *              article, lib/reports.ts's conversion-by-project, and
 *              lib/company-stats.ts's four public-site headline figures.
 *   Leads    — lib/reports.ts's monthly/source/pipeline reports (the same
 *              ones the dashboard draws) plus getWeekOverWeekLeads(),
 *              written but never wired to a screen until now. Gated on
 *              viewAllLeads, same rule as everywhere else CRM data shows.
 *
 * Role.ADMIN — the (growth) zone's ordinary floor; unlike seo/translations,
 * nothing here needs the zone's one exception. A role that meets
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
  FUNNEL_STAGES,
} from "@/lib/reports";
import { getCompanyStats } from "@/lib/company-stats";
import { intlLocale } from "@/lib/format";
import AnalyticsTabs from "@/components/admin/AnalyticsTabs";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminAnalyticsPage(props: Props) {
  const { locale } = await props.params;

  const session = await requireAdmin(locale, Role.ADMIN);
  const canViewLeads = can(session.role, "viewAllLeads");

  const t = await getTranslations({ locale, namespace: "admin" });

  const [trend, settings, topArticlesView, conversions, companyStats, leadsData] = await Promise.all([
    getPageViewTrend(),
    getSiteSettings(),
    getNewsList({ ...parseFilters({}), sort: "views", perPage: 10 }),
    getProjectConversions(locale, 12),
    getCompanyStats(),
    canViewLeads
      ? Promise.all([getMonthlyLeads(12), getLeadsBySource(12), getLeadPipeline(), getWeekOverWeekLeads()])
      : Promise.resolve(null),
  ]);

  const offline = isDatabaseOffline();

  const dayFormat = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" });
  const monthFormat = new Intl.DateTimeFormat(intlLocale(locale), { month: "short", year: "2-digit" });

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
      <header>
        <p className="admin-section-title">{t("nav.analytics")}</p>
        <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-semibold text-primary sm:text-3xl">
          <BarChart3 size={22} strokeWidth={1.75} className="text-accent-700" aria-hidden />
          {t("analytics.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("analytics.subtitle")}</p>
      </header>

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <AnalyticsTabs
        locale={locale}
        canViewLeads={canViewLeads}
        traffic={{
          trend: trendPoints,
          totalViews: trend.totalViews,
          countingSince: trend.countingSince,
          gaConfigured: settings.analytics.gaMeasurementId.trim().length > 0,
          metaPixelConfigured: settings.analytics.metaPixelId.trim().length > 0,
          searchConsoleConfigured: settings.analytics.googleSiteVerification.trim().length > 0,
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
          project: t("projects.name"),
          total: t("reports.monthly.total"),
          worked: t("reports.conversion.worked"),
          won: t("reports.monthly.won"),
          rate: t("reports.conversion.rate"),
          notWorked: t("reports.conversion.notWorked"),
          weekOverWeek: t("analytics.weekOverWeek"),
          weekOverWeekHint: t("analytics.weekOverWeekHint"),
          monthlyTitle: t("reports.monthly.title"),
          sourcesTitle: t("reports.sources.title"),
          pipelineTitle: t("reports.pipeline.title"),
          bottleneck: t("reports.pipeline.bottleneckFlag"),
        }}
      />
    </div>
  );
}
