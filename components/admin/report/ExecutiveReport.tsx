/**
 * components/admin/report/ExecutiveReport.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The monthly report for the executive audience: the whole site on two A4
 * pages, in the brand's navy and gold.
 *
 * It is written to be read in the order the reader decides things:
 *
 *   1. six headline figures, each against the previous period;
 *   2. the summary and next steps, which a person edits and signs
 *      (ReportNote), before any chart, because it is the part they act on;
 *   3. traffic, then enquiries by source and by development, then the
 *      sales pipeline, which is how a visitor becomes a buyer;
 *   4. what people read and which events filled;
 *   5. the site's health: audit score, its top issues and Core Web Vitals.
 *
 * Every chart carries its numbers and a summary line. An executive is
 * reading to decide something and should not have to measure bars to do
 * it. Figures come from lib/reports/seo-report.ts and
 * lib/reports/executive.ts, both bounded by the report's period.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { formatNumber, intlLocale } from "@/lib/format";
import { formatVital } from "@/lib/analytics/vitals";
import type { ReportData } from "@/lib/reports/seo-report";
import { changePercent, type ExecutiveData } from "@/lib/reports/executive";
import { FUNNEL_STAGES } from "@/lib/reports";
import { BRAND, BarList, ColumnChart } from "./ReportCharts";
import {
  Empty,
  KpiTile,
  Masthead,
  PrintPageStyle,
  RatingChip,
  Section,
  Sheet,
  SubTitle,
  Summary,
  Table,
} from "./ReportParts";

type Props = {
  data: ReportData;
  exec: ExecutiveData;
  /** The report's language, not the admin's — see reportLocale. */
  locale: string;
  noteBody: string;
  preparedBy: string | null;
};

export default async function ExecutiveReport({ data, exec, locale, noteBody, preparedBy }: Props) {
  const [t, tNav] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "nav" }),
  ]);
  const x = (key: string, values?: Record<string, string | number>) =>
    t(`reports.exec.${key}` as never, values as never);
  const n = (value: number) => formatNumber(locale, value);

  const utc = { timeZone: "UTC" } as const;
  const longDate = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", year: "numeric", ...utc });
  const shortDate = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", ...utc });
  const monthName = new Intl.DateTimeFormat(intlLocale(locale), { month: "long", year: "numeric", ...utc });

  const lastDay = new Date(data.period.end.getTime() - 86_400_000);
  const periodText = `${longDate.format(data.period.start)} – ${longDate.format(lastDay)}`;

  const enquiries = { current: data.leads.current.all, previous: data.leads.previous.all };
  const google = { current: data.leads.current.google, previous: data.leads.previous.google };
  const vsPrevious = x("vsPrevious");

  const peak = exec.views.days.reduce<{ day: string; count: number } | null>(
    (best, d) => (d.count > 0 && (!best || d.count > best.count) ? d : best),
    null,
  );
  const funnel = exec.pipeline.stages.filter((s) => (FUNNEL_STAGES as string[]).includes(s.status));
  const conversion = exec.views.current > 0 ? (enquiries.current / exec.views.current) * 100 : null;
  /* A page as a person would name it: the project or article title when
     executive.ts found one, the menu label for the fixed pages, and the
     path only when neither applies. */
  const NAV_PAGES: Record<string, string> = {
    "/": "home",
    "/projects": "projects",
    "/progress": "progress",
    "/news": "news",
    "/events": "events",
    "/about": "about",
    "/contact": "contact",
    "/achievements": "achievements",
    "/e-brochure": "eBrochure",
  };
  const pageName = (path: string, title: string | null) =>
    title ?? (NAV_PAGES[path] ? tNav(NAV_PAGES[path] as never) : path);
  const ratingLabel = (rating: "good" | "needsImprovement" | "poor") =>
    ({
      good: t("analytics.vitals.ratingGood"),
      needsImprovement: t("analytics.vitals.ratingNeedsImprovement"),
      poor: t("analytics.vitals.ratingPoor"),
    })[rating];

  return (
    <>
      <PrintPageStyle footer={x("confidential")} />
      <Sheet>
        <Masthead
          eyebrow={x("eyebrow")}
          title={x("title", { month: monthName.format(data.period.start) })}
          lines={[
            periodText,
            [x("dataUpTo", { date: longDate.format(data.coversUntil) }), preparedBy ? x("preparedBy", { name: preparedBy }) : null]
              .filter(Boolean)
              .join(" · "),
          ]}
        />

        <div className="px-10 pb-10 pt-7">
          {/* ── 1. Headline figures ─────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <KpiTile label={x("kpiViews")} value={n(exec.views.current)} change={changePercent(exec.views)} hint={vsPrevious} />
            <KpiTile label={x("kpiEnquiries")} value={n(enquiries.current)} change={changePercent(enquiries)} hint={vsPrevious} />
            <KpiTile label={x("kpiViewings")} value={n(exec.viewings.current)} change={changePercent(exec.viewings)} hint={vsPrevious} />
            <KpiTile label={x("kpiWon")} value={n(exec.won.current)} change={changePercent(exec.won)} hint={vsPrevious} />
            <KpiTile label={x("kpiGoogle")} value={n(google.current)} change={changePercent(google)} hint={vsPrevious} />
            <KpiTile
              label={x("kpiHealth")}
              value={data.audit.score === null ? "—" : `${n(data.audit.score)}/100`}
              change={
                data.audit.score !== null && data.audit.previous !== null
                  ? data.audit.score - data.audit.previous
                  : null
              }
              hint={x("kpiHealthHint")}
            />
          </div>

          {/* ── 2. Summary and next steps ───────────────────────────── */}
          <Section title={x("summary")} note={data.note.isDraft ? t("reports.view.notesDraft") : undefined}>
            {noteBody.trim() ? (
              <div className="space-y-1.5 text-[12px] leading-relaxed" style={{ color: BRAND.ink }}>
                {noteBody
                  .split("\n")
                  .filter((line) => line.trim())
                  .map((line, i) => (
                    <p key={i} className="flex gap-2.5">
                      <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: BRAND.gold }} aria-hidden />
                      <span>{line.replace(/^[-•*]\s*/, "")}</span>
                    </p>
                  ))}
              </div>
            ) : (
              <Empty text={t("reports.view.notesEmpty")} />
            )}
          </Section>

          {/* ── 3. Traffic ──────────────────────────────────────────── */}
          <Section title={x("traffic")} note={x("daily")}>
            {exec.views.current > 0 ? (
              <>
                <ColumnChart
                  locale={locale}
                  points={exec.views.days.map((d) => ({
                    label: shortDate.format(new Date(`${d.day}T00:00:00Z`)),
                    value: d.count,
                  }))}
                />
                <Summary
                  items={[
                    { label: x("sumTotal"), value: n(exec.views.current) },
                    { label: x("sumPrevious"), value: n(exec.views.previous) },
                    { label: x("sumAverage"), value: n(Math.round(exec.views.current / Math.max(1, exec.views.days.length))) },
                    ...(peak ? [{ label: x("sumPeak"), value: `${n(peak.count)} · ${shortDate.format(new Date(`${peak.day}T00:00:00Z`))}` }] : []),
                    ...(conversion !== null ? [{ label: x("sumConversion"), value: `${conversion.toFixed(1)}%` }] : []),
                  ]}
                />
              </>
            ) : (
              <Empty text={x("noData")} />
            )}
          </Section>

          {/* ── 4. Enquiries ────────────────────────────────────────── */}
          <Section title={x("enquiries")} note={periodText}>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <SubTitle>{x("bySource")}</SubTitle>
                {exec.bySource.length > 0 ? (
                  <BarList
                    locale={locale}
                    tone="gold"
                    rows={exec.bySource.map((s) => ({ label: t(`leadSource.${s.source}` as never), value: s.count }))}
                  />
                ) : (
                  <Empty text={x("noData")} />
                )}
              </div>
              <div>
                <SubTitle>{x("byProject")}</SubTitle>
                {data.rows.length > 0 ? (
                  <Table
                    head={[t("reports.view.columnProject"), x("colEnquiries"), x("colGoogle")]}
                    align={["left", "right", "right"]}
                    rows={data.rows.map((row) => [
                      row.key === "news" ? t("reports.view.newsRow") : row.name,
                      n(row.allLeads),
                      n(row.googleLeads),
                    ])}
                  />
                ) : (
                  <Empty text={enquiries.current > 0 ? x("noProject") : x("noData")} />
                )}
              </div>
            </div>
          </Section>

          {/* ── 5. Pipeline ─────────────────────────────────────────── */}
          {funnel.length > 0 && (
            <Section title={x("pipeline")} note={x("asOfToday")}>
              <BarList
                locale={locale}
                rows={funnel.map((stage) => ({
                  label: t(`leadStatus.${stage.status}` as never),
                  value: stage.count,
                  flag:
                    exec.pipeline.bottleneck?.status === stage.status
                      ? t("reports.pipeline.bottleneckFlag")
                      : undefined,
                }))}
              />
              <Summary
                items={[
                  { label: x("openTotal"), value: n(exec.pipeline.openTotal) },
                  ...(exec.pipeline.bottleneck
                    ? [
                        {
                          label: t("reports.pipeline.bottleneckFlag"),
                          value: x("bottleneck", {
                            stage: t(`leadStatus.${exec.pipeline.bottleneck.status}` as never),
                            days: Math.round(exec.pipeline.bottleneck.avgDaysInStage),
                          }),
                        },
                      ]
                    : []),
                ]}
              />
            </Section>
          )}

          {/* ── 6. Content and events ───────────────────────────────── */}
          <Section title={x("content")}>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <SubTitle>{x("topPages")}</SubTitle>
                {exec.topPages.length > 0 ? (
                  <Table
                    head={[x("colPage"), x("colViews")]}
                    align={["left", "right"]}
                    rows={exec.topPages.map((page) => [
                      <span key="p">
                        {pageName(page.path, page.title)}
                        <span className="block break-all text-[9px]" style={{ color: BRAND.muted }}>
                          {page.path}
                        </span>
                      </span>,
                      n(page.views),
                    ])}
                  />
                ) : (
                  <Empty text={x("noData")} />
                )}
              </div>
              <div>
                <SubTitle>{t("reports.rsvp.title")}</SubTitle>
                {exec.events.length > 0 ? (
                  <Table
                    head={[x("colEvent"), x("colSeats")]}
                    align={["left", "right"]}
                    rows={exec.events.map((event) => [
                      <span key="e">
                        {event.title || "—"}
                        <span className="block text-[9.5px]" style={{ color: BRAND.muted }}>
                          {longDate.format(event.startsAt)}
                        </span>
                      </span>,
                      event.capacity !== null
                        ? `${n(event.registered)}/${n(event.capacity)}`
                        : n(event.registered),
                    ])}
                  />
                ) : (
                  <Empty text={x("noEvents")} />
                )}
              </div>
            </div>
          </Section>

          {/* ── 7. Website health ───────────────────────────────────── */}
          <Section title={x("health")}>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <SubTitle>{x("topIssues")}</SubTitle>
                {data.topIssues.length > 0 ? (
                  <Table
                    head={[x("colIssue"), x("colPages")]}
                    align={["left", "right"]}
                    rows={data.topIssues.slice(0, 5).map((issue) => [
                      t(`seo.audit.rules.${issue.rule}` as never),
                      n(issue.urlCount),
                    ])}
                  />
                ) : (
                  <Empty text={x("noIssues")} />
                )}
              </div>
              <div>
                <SubTitle>{t("analytics.vitals.title")}</SubTitle>
                <Table
                  head={[x("colMetric"), x("colValue")]}
                  align={["left", "right"]}
                  rows={data.vitals.map((vital) => [
                    <span key="m">
                      <b className="font-semibold">{vital.metric}</b>{" "}
                      <span style={{ color: BRAND.muted }}>
                        {t(`analytics.vitals.hint${vital.metric[0]}${vital.metric.slice(1).toLowerCase()}` as never)}
                      </span>
                    </span>,
                    vital.enoughSamples ? (
                      <span key="v" className="inline-flex items-center gap-2">
                        <b className="font-semibold">{formatVital(vital.metric, vital.value)}</b>
                        <RatingChip rating={vital.rating} label={ratingLabel(vital.rating)} />
                      </span>
                    ) : (
                      <span key="v" style={{ color: BRAND.muted }}>
                        {t("analytics.vitals.notEnough")}
                      </span>
                    ),
                  ])}
                />
              </div>
            </div>
          </Section>

          <p className="mt-8 text-[9.5px] leading-relaxed" style={{ color: BRAND.muted }}>
            {x("footnote")}
          </p>
        </div>
      </Sheet>
    </>
  );
}
