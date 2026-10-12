/**
 * app/[locale]/admin/(growth)/analytics/report/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The Analytics screen as a document: an A4 report in the brand's navy and
 * gold, opened by "Export report" and saved as a PDF from the print dialog.
 *
 * Same export path as /admin/reports, for the reason given there: the
 * operating system's print dialog already writes the PDF, and a headless
 * browser in the image to do it server-side would cost about 400MB. It
 * also gets Thai shaping and the site's own Roboto without embedding a
 * font in a PDF library.
 *
 * The admin shell is hidden in print by globals.css ([data-admin-chrome]),
 * and everything on this page that is a control carries print:hidden, so
 * the PDF is this sheet and nothing else. Colours are hex (see
 * ReportCharts' BRAND) so a dark-themed admin session still exports navy
 * on white.
 *
 * Same figures and getters as the Analytics screen, for the same range
 * (?range=), so the PDF cannot say something the screen does not. Lead
 * figures follow the screen's viewAllLeads rule.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { can } from "@/lib/permissions";
import { getPageViewTrend } from "@/lib/admin/analytics";
import { getNewsList, parseFilters } from "@/lib/admin/news-list";
import {
  FUNNEL_STAGES,
  getEventRsvpSummary,
  getLeadPipeline,
  getLeadsBySource,
  getMonthlyLeads,
  getProjectConversions,
  getWeekOverWeekLeads,
} from "@/lib/reports";
import { getConsentCoverage, getVitalsOverview } from "@/lib/analytics/vitals-report";
import { formatVital, type VitalKey } from "@/lib/analytics/vitals";
import { isRangeDays, type RangeDays } from "@/lib/dashboard-range";
import { formatNumber, intlLocale } from "@/lib/format";
import { siteConfig } from "@/config/site";
import {
  Empty,
  KpiTile,
  Legend,
  Masthead,
  PrintPageStyle,
  RatingChip,
  Section,
  Sheet,
  Summary,
  Table,
} from "@/components/admin/report/ReportParts";
import { BRAND, BarList, ColumnChart } from "@/components/admin/report/ReportCharts";
import PrintToolbar from "@/components/admin/report/PrintToolbar";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string; print?: string }>;
};

export default async function AnalyticsReportPage(props: Props) {
  const [{ locale }, searchParams] = await Promise.all([props.params, props.searchParams]);

  const session = await requireAdmin(locale, Role.ADMIN);
  const canViewLeads = can(session.role, "viewAllLeads");

  const t = await getTranslations({ locale, namespace: "admin" });
  const r = (key: string, values?: Record<string, string | number>) =>
    t(`analytics.report.${key}` as never, values as never);

  const rangeDays: RangeDays = isRangeDays(searchParams.range) ? searchParams.range : "30";
  const days = Number(rangeDays);
  const months = Math.max(1, Math.ceil(days / 30));

  const [trend, articles, conversions, rsvp, leads, vitals, coverage] = await Promise.all([
    getPageViewTrend(days),
    getNewsList({ ...parseFilters({}), sort: "views", perPage: 8 }),
    getProjectConversions(locale, months),
    getEventRsvpSummary(locale, 6),
    canViewLeads
      ? Promise.all([getMonthlyLeads(Math.max(6, months)), getLeadsBySource(months), getLeadPipeline(), getWeekOverWeekLeads()])
      : Promise.resolve(null),
    getVitalsOverview(days),
    getConsentCoverage(days),
  ]);

  const n = (value: number) => formatNumber(locale, value);
  const now = new Date();
  const from = new Date(now.getTime() - days * 86_400_000);
  const dateLong = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" });
  const dayShort = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" });
  const monthShort = new Intl.DateTimeFormat(intlLocale(locale), { month: "short", year: "2-digit" });

  /* Daily up to 90 days; beyond that a year of daily columns is a grey
     smear on A4, so it is summed by week. */
  const weekly = trend.days.length > 90;
  const peakDay = trend.days.reduce<(typeof trend.days)[number] | null>(
    (best, d) => (d.count > 0 && (!best || d.count > best.count) ? d : best),
    null,
  );
  const trendColumns = weekly
    ? Array.from({ length: Math.ceil(trend.days.length / 7) }, (_, w) => {
        const week = trend.days.slice(w * 7, w * 7 + 7);
        return {
          label: dayShort.format(new Date(`${week[0].day}T00:00:00Z`)),
          value: week.reduce((sum, d) => sum + d.count, 0),
        };
      })
    : trend.days.map((d) => ({ label: dayShort.format(new Date(`${d.day}T00:00:00Z`)), value: d.count }));

  /* lib/reports.ts counts lead windows in calendar months (from the 1st of
     the month `months - 1` back), not in days. The label names that first
     day instead of "last month", which would read as the last 30 days. */
  const monthsSince = r("since", {
    date: dateLong.format(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)),
  });

  const [monthly, bySource, pipeline, wow] = leads ?? [[], [], null, null];
  const leadsInRange = bySource.reduce((sum, s) => sum + s.count, 0);
  const wonInRange = monthly.slice(-months).reduce((sum, m) => sum + m.won, 0);
  const monthlyTotal = monthly.reduce((sum, m) => sum + m.total, 0);
  const monthlyWon = monthly.reduce((sum, m) => sum + m.won, 0);
  const funnel = pipeline ? pipeline.stages.filter((s) => (FUNNEL_STAGES as string[]).includes(s.status)) : [];

  const kpis = [
    { label: r("kpiViews"), value: n(trend.totalViews), hint: r("lastDays", { days }) },
    ...(canViewLeads
      ? [
          { label: r("kpiLeads"), value: n(leadsInRange), hint: monthsSince },
          { label: r("kpiWon"), value: n(wonInRange), hint: monthsSince },
          {
            label: r("kpiOpen"),
            value: n(pipeline?.openTotal ?? 0),
            hint: r("thisWeek", { count: wow?.thisWeek ?? 0 }),
          },
        ]
      : []),
  ];

  const devices = vitals.overall;
  const metrics: VitalKey[] = ["LCP", "INP", "CLS", "TTFB"];
  const company = siteConfig.legalName;

  return (
    <>
      <PrintPageStyle footer={r("confidential")} />

      <PrintToolbar
        backHref={`/${locale}/admin/analytics?range=${rangeDays}`}
        autoPrint={searchParams.print === "1"}
        labels={{ save: r("save"), hint: r("saveHint"), back: r("back") }}
      />

      <Sheet>
        <Masthead
          eyebrow={r("eyebrow")}
          title={r("title")}
          lines={[
            `${r("period", { from: dateLong.format(from), to: dateLong.format(now) })} · ${r("lastDays", { days })}`,
            session.name
              ? r("prepared", { date: dateLong.format(now), name: session.name })
              : r("preparedOn", { date: dateLong.format(now) }),
          ]}
        />

        <div className="px-10 pb-10 pt-7">
          {/* ── Headline figures ───────────────────────────────────── */}
          <div className={`grid gap-3 ${kpis.length === 4 ? "grid-cols-4" : "grid-cols-1"}`}>
            {kpis.map((kpi) => (
              <KpiTile key={kpi.label} label={kpi.label} value={kpi.value} hint={kpi.hint} />
            ))}
          </div>

          {/* ── Traffic ────────────────────────────────────────────── */}
          <Section title={r("traffic")} note={weekly ? r("weekly") : r("daily")}>
            {trendColumns.length > 0 ? (
              <>
                <ColumnChart locale={locale} points={trendColumns} />
                <Summary
                  items={[
                    { label: r("sumTotal"), value: n(trend.totalViews) },
                    { label: r("sumAverage"), value: n(Math.round(trend.totalViews / Math.max(1, trend.days.length))) },
                    ...(peakDay
                      ? [{ label: r("sumPeak"), value: `${n(peakDay.count)} · ${dateLong.format(new Date(`${peakDay.day}T00:00:00Z`))}` }]
                      : []),
                  ]}
                />
              </>
            ) : (
              <Empty text={r("noData")} />
            )}
          </Section>

          {/* ── Leads ──────────────────────────────────────────────── */}
          {canViewLeads && (
            <Section title={r("leads")}>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="mb-1 text-[11px] font-semibold" style={{ color: BRAND.navy }}>
                    {t("reports.monthly.title")}
                  </p>
                  <Legend items={[
                    { color: BRAND.navy, label: t("reports.monthly.total") },
                    { color: BRAND.gold, label: t("reports.monthly.won") },
                  ]} />
                  {monthly.length > 0 ? (
                    <ColumnChart
                      locale={locale}
                      width={320}
                      height={150}
                      points={monthly.map((m) => ({
                        label: monthShort.format(new Date(`${m.month}-01T00:00:00Z`)),
                        value: m.total,
                        highlight: m.won,
                      }))}
                    />
                  ) : (
                    <Empty text={r("noData")} />
                  )}
                  {monthly.length > 0 && (
                    <Summary
                      items={[
                        { label: r("sumLeads", { months: monthly.length }), value: n(monthlyTotal) },
                        { label: t("reports.monthly.won"), value: n(monthlyWon) },
                        {
                          label: r("sumWinRate"),
                          value: monthlyTotal > 0 ? `${n(Math.round((monthlyWon / monthlyTotal) * 100))}%` : "—",
                        },
                      ]}
                    />
                  )}
                </div>
                <div>
                  <p className="mb-3 text-[11px] font-semibold" style={{ color: BRAND.navy }}>
                    {t("reports.sources.title")}
                  </p>
                  {bySource.length > 0 ? (
                    <BarList
                      locale={locale}
                      tone="gold"
                      rows={bySource.map((s) => ({ label: t(`leadSource.${s.source}` as never), value: s.count }))}
                    />
                  ) : (
                    <Empty text={r("noData")} />
                  )}
                </div>
              </div>

              {funnel.length > 0 && (
                <div className="mt-6">
                  <p className="mb-3 text-[11px] font-semibold" style={{ color: BRAND.navy }}>
                    {t("reports.pipeline.title")}
                  </p>
                  <BarList
                    locale={locale}
                    rows={funnel.map((stage) => ({
                      label: t(`leadStatus.${stage.status}` as never),
                      value: stage.count,
                      flag: pipeline?.bottleneck?.status === stage.status ? t("reports.pipeline.bottleneckFlag") : undefined,
                    }))}
                  />
                </div>
              )}
            </Section>
          )}

          {/* ── Projects ───────────────────────────────────────────── */}
          {conversions.length > 0 && (
            <Section title={t("reports.conversion.title")} note={monthsSince}>
              <Table
                head={[t("projects.name"), t("reports.conversion.total"), t("reports.conversion.worked"), t("reports.conversion.won"), t("reports.conversion.rate")]}
                align={["left", "right", "right", "right", "right"]}
                rows={conversions.map((row) => [
                  <span key="n" className="font-medium">{row.name}</span>,
                  n(row.total),
                  n(row.worked),
                  n(row.won),
                  row.rate === null ? "—" : `${n(Math.round(row.rate))}%`,
                ])}
              />
            </Section>
          )}

          {/* ── Content ────────────────────────────────────────────── */}
          {articles.rows.length > 0 && (
            <Section title={t("analytics.topArticlesTitle")}>
              <Table
                head={[t("analytics.article"), t("analytics.views30"), t("analytics.leadsFromArticle")]}
                align={["left", "right", "right"]}
                rows={articles.rows.map((row) => [row.title, n(row.views30), n(row.leads)])}
              />
            </Section>
          )}

          {rsvp.length > 0 && (
            <Section title={t("reports.rsvp.title")}>
              <Table
                head={[r("event"), r("date"), r("seats")]}
                align={["left", "left", "right"]}
                rows={rsvp.map((event) => [
                  event.title || "—",
                  dateLong.format(event.startsAt),
                  event.capacity !== null
                    ? t("reports.rsvp.filled", { registered: event.registered, capacity: event.capacity })
                    : t("reports.rsvp.registeredOnly", { registered: event.registered }),
                ])}
              />
            </Section>
          )}

          {/* ── Web Vitals ─────────────────────────────────────────── */}
          <Section
            title={t("analytics.vitals.title")}
            note={
              coverage === null
                ? t("analytics.vitals.coverageUnknown")
                : t("analytics.vitals.coverage", { percent: coverage })
            }
          >
            {devices.length === 0 ? (
              <Empty text={t("analytics.vitals.empty")} />
            ) : (
              <Table
                head={[r("metric"), ...devices.map((d) => t(`analytics.vitals.${d.device}` as never))]}
                align={["left", ...devices.map(() => "right" as const)]}
                rows={metrics.map((metric) => [
                  <span key="m">
                    <b className="font-semibold">{metric}</b>{" "}
                    <span style={{ color: BRAND.muted }}>
                      {t(`analytics.vitals.hint${metric[0]}${metric.slice(1).toLowerCase()}` as never)}
                    </span>
                  </span>,
                  ...devices.map((device) => {
                    const figure = device.figures.find((f) => f.metric === metric);
                    if (!figure || !figure.enoughSamples) {
                      return (
                        <span key={device.device} style={{ color: BRAND.muted }}>
                          {t("analytics.vitals.notEnough")}
                        </span>
                      );
                    }
                    const ratingLabel = {
                      good: t("analytics.vitals.ratingGood"),
                      needsImprovement: t("analytics.vitals.ratingNeedsImprovement"),
                      poor: t("analytics.vitals.ratingPoor"),
                    }[figure.rating];
                    return (
                      <span key={device.device} className="inline-flex items-center gap-2">
                        <span className="font-semibold">{formatVital(metric, figure.value)}</span>
                        <RatingChip rating={figure.rating} label={ratingLabel} />
                      </span>
                    );
                  }),
                ])}
              />
            )}
          </Section>

          {/* On screen only: in print the @page footer carries this. */}
          <p className="mt-10 border-t pt-3 text-[9px] print:hidden" style={{ borderColor: BRAND.line, color: BRAND.muted }}>
            {company} · {r("confidential")}
          </p>
        </div>
      </Sheet>
    </>
  );
}
