/**
 * app/[locale]/admin/(growth)/seo/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * SEO overview — the one screen that answers "is the site's SEO actually
 * okay" without opening Search Console, and the index tab of the hub.
 * Everything on it is computed live by lib/seo-audit.ts from the same rows
 * the public pages render from; see that file's header for which parts are
 * a live query vs. a recorded fact about the code.
 *
 * The header and the strip of tabs are ./layout.tsx's. This page used to
 * carry two buttons up there — Keywords and Links — which were the only
 * way into either screen; they are tabs now, beside the two that had no
 * way in at all.
 *
 * ADMIN and above, matching /admin/settings — a wrong noindex toggle from
 * here is a content decision, not an account-security one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Info,
  XCircle,
} from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline } from "@/lib/db";
import {
  getSeoAudit,
  type ContentTypeKey,
  type SeoIssue,
} from "@/lib/seo-audit";
import { getAuditOverview } from "@/lib/seo/audit-report";
import { getRecentAlerts } from "@/lib/seo/alerts";
import { getKeywordReport } from "@/lib/seo/keyword-report";
import { getSiteSettings } from "@/lib/settings";
import { brandTotals, parseBrandTerms } from "@/lib/seo/brand";
import { TrendChart } from "@/components/admin/DashboardCharts";
import ProgressRing from "@/components/admin/ui/ProgressRing";
import { intlLocale } from "@/lib/format";

type Props = { params: Promise<{ locale: string }> };

const CONTENT_ADMIN_HREF: Record<ContentTypeKey, string | null> = {
  projects: "/projects",
  news: "/news",
  events: "/events",
  eBrochures: "/e-brochures",
  static: null,
};

const SEVERITY_STYLE: Record<
  SeoIssue["severity"],
  { badge: string; icon: typeof AlertTriangle }
> = {
  critical: { badge: "bg-adm-danger-bg text-adm-danger", icon: XCircle },
  warning: { badge: "bg-adm-warning-bg text-adm-warning", icon: AlertTriangle },
  minor: { badge: "bg-adm-text/4 text-adm-muted", icon: Info },
};

const SEVERITY_RANK = { critical: 0, warning: 1, minor: 2 } as const;

/** Share of a fraction, for the little progress bars in the completeness table. */
function pct(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((n / total) * 100);
}

function barColor(share: number): string {
  if (share >= 90) return "bg-adm-success";
  if (share >= 60) return "bg-accent-700";
  return "bg-adm-danger";
}

export default async function AdminSeoOverviewPage(props: Props) {
  const { locale } = await props.params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, audit, overview, alerts, search, settings] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getSeoAudit(),
    getAuditOverview(),
    getRecentAlerts(),
    getKeywordReport(),
    getSiteSettings(),
  ]);

  const searchTotals = brandTotals(search.stats, parseBrandTerms(settings.seo.brandTerms));

  /* "71" alone says nothing; "71, up 4 since Tuesday" is the form anybody
     acts on. Only SeoAuditRun can produce it. */
  const delta =
    overview.latest && overview.previous
      ? overview.latest.avgScore - overview.previous.avgScore
      : null;

  const offline = isDatabaseOffline();

  const counts = {
    critical: audit.issues.filter((i) => i.severity === "critical").length,
    warning: audit.issues.filter((i) => i.severity === "warning").length,
    minor: audit.issues.filter((i) => i.severity === "minor").length,
  };

  const structuredMissing = audit.structuredData.filter(
    (s) => !s.implemented,
  ).length;

  /* A Search Console date is a day, not a moment — it reports per day and
     has no clock. Showing "24 Sep 07:00" invents a precision the source
     does not have. */
  const searchDayFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const alertDayFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const generatedAtLabel = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(audit.generatedAt);

  return (
    /* No header and no keywords/links buttons: the hub layout draws the
       title, and those two buttons were the only way into two of its tabs
       — which is exactly the problem the tab strip solves. */
    <div className="space-y-8">
      <p className="text-sm text-adm-muted">
        {t("seo.subtitle", { date: generatedAtLabel })}
      </p>

      {offline && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      {/* ── Score, figures, next steps (v4) ──────────────────────────────
          The audit's own average as a ring on the left — not the
          aggregate this page used to compute: two numbers both called "the
          SEO score" is the thing the plan warns about most often — and the
          other figures two by two beside it. */}
      <div className="grid gap-4 lg:grid-cols-12">
        <section className="admin-card flex flex-col items-center justify-center text-center lg:col-span-4">
          <h2 className="text-[13px] font-semibold text-adm-text">{t("seo.score")}</h2>
          <div className="mt-4">
            {overview.latest ? (
              <ProgressRing value={overview.latest.avgScore} size="xl" label={t("seo.score")} />
            ) : (
              <span className="flex h-[130px] w-[130px] items-center justify-center rounded-full border-[10px] border-adm-line text-sm font-medium text-adm-muted">
                {t("seo.overview.neverRunShort")}
              </span>
            )}
          </div>
          {overview.latest ? (
            <p className="mt-3 text-xs text-adm-muted">
              {delta !== null && (
                <span
                  className={`mr-1.5 tabular-nums ${
                    delta > 0 ? "text-adm-success" : delta < 0 ? "text-adm-danger" : "text-adm-muted"
                  }`}
                >
                  {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(delta)}
                </span>
              )}
              {t("seo.overview.auditScoreHint", { urls: overview.latest.urlCount })}
            </p>
          ) : (
            <p className="mt-3 text-xs text-adm-muted">{t("seo.overview.neverRun")}</p>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
        <div className="admin-card">
            <p className="text-xs font-medium uppercase tracking-wide text-adm-muted">
              {t("seo.indexablePages")}
            </p>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums text-adm-text">
                {audit.totals.indexableLocalePages}
              </span>
              <span className="text-sm text-adm-muted">
                /{audit.totals.totalLocalePages}
              </span>
            </p>
            <p className="mt-1 text-xs text-adm-muted">
              {audit.totals.noIndexCount > 0
                ? t("seo.indexablePagesHint", {
                    count: audit.totals.noIndexCount,
                  })
                : t("seo.indexablePagesHintNone")}
            </p>
          </div>

          <div
            className={`admin-card ${audit.issues.length > 0 ? "border-adm-danger/30" : ""}`}
          >
            <p
              className={`text-xs font-medium uppercase tracking-wide ${
                audit.issues.length > 0 ? "text-adm-danger" : "text-adm-muted"
              }`}
            >
              {t("seo.issuesToFix")}
            </p>
            <p className="mt-4">
              <span
                className={`text-3xl font-semibold tabular-nums ${
                  audit.issues.length > 0 ? "text-adm-danger" : "text-adm-text"
                }`}
              >
                {audit.issues.length}
              </span>
            </p>
            <p className="mt-1 text-xs text-adm-muted">
              {t("seo.issuesBreakdown", {
                critical: counts.critical,
                warning: counts.warning,
                minor: counts.minor,
              })}
            </p>
            {overview.latest && (
              <p className="mt-2 text-xs">
                <Link
                  href={`/${locale}/admin/seo/audit`}
                  className="text-adm-muted underline hover:text-adm-text"
                >
                  {t("seo.overview.urlsFailing", {
                    count:
                      overview.latest.urlCount - overview.latest.passAllCount,
                  })}
                </Link>
              </p>
            )}
          </div>

          <div className="admin-card">
            <p className="text-xs font-medium uppercase tracking-wide text-adm-muted">
              {t("seo.structuredData")}
            </p>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums text-adm-text">
                {audit.structuredData.length - structuredMissing}
              </span>
              <span className="text-sm text-adm-muted">
                /{audit.structuredData.length}
              </span>
            </p>
            <p className="mt-1 text-xs text-adm-muted">
              {structuredMissing > 0
                ? t("seo.structuredDataHint", {
                    types: audit.structuredData
                      .filter((s) => !s.implemented)
                      .map((s) => s.type)
                      .join(", "),
                  })
                : t("seo.structuredDataHintNone")}
            </p>
          </div>

          <div className="admin-card">
            <p className="text-xs font-medium uppercase tracking-wide text-adm-muted">
              {t("seo.overview.alertsTitle")}
            </p>
            <p className="mt-4 text-3xl font-semibold tabular-nums text-adm-text">{alerts.length}</p>
            <p className="mt-1 text-xs text-adm-muted">{t("seo.overview.alertsWeek")}</p>
          </div>
        </div>
      </div>

      {/* ── Next steps: the three most serious issues the audit found,
          each a tile with its fix link. Not "AI recommends" as the mockup
          has it — that is a later phase — so it says what it is. */}
      {audit.issues.length > 0 && (
        <section className="admin-card">
          <h2 className="text-[15px] font-semibold text-adm-text">{t("seo.overview.nextSteps")}</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {[...audit.issues]
              .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
              .slice(0, 3)
              .map((issue) => (
                <li key={issue.id} className="flex flex-col rounded-[12px] border border-adm-line p-3.5">
                  <span
                    className={`w-fit rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${SEVERITY_STYLE[issue.severity].badge}`}
                  >
                    {t(`seo.severity.${issue.severity}`)}
                  </span>
                  <p className="mt-2 flex-1 text-sm font-medium leading-snug text-adm-text">
                    {t(`seo.issues.${issue.key}`, issue.count !== undefined ? { count: issue.count } : undefined)}
                  </p>
                  {issue.href && (
                    <Link href={issue.href} className="admin-btn-ghost admin-btn-sm mt-3 w-fit">
                      {t("seo.issuesFix")}
                      <ArrowUpRight size={12} aria-hidden />
                    </Link>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* The trend, which only SeoAuditRun can answer: SeoUrlState is
          overwritten every run and knows nothing about last week. */}
      {overview.trend.length > 1 && (
        <section className="admin-card">
          <h2 className="admin-label">{t("seo.overview.trendTitle")}</h2>
          <TrendChart
            data={overview.trend.map((point) => ({
              label: point.at.toISOString().slice(5, 10),
              count: point.avgScore,
            }))}
            labels={{
              count: t("seo.overview.trendPointLabel"),
              empty: t("seo.overview.neverRun"),
            }}
          />
        </section>
      )}

      {/*
        What the alert rules have said lately.

        Seven days, newest first, and never hidden when empty: "nothing has
        fired" and "alerting is not running" look identical on a card that
        disappears, and the second is the state somebody needs to notice.
        The rules themselves are switched on the reports screen, which is
        where the thresholds are explained.
      */}
      <section className="admin-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="admin-label mb-0">{t("seo.overview.alertsTitle")}</h2>
          <Link
            href={`/${locale}/admin/reports`}
            className="text-xs text-adm-text underline"
          >
            {t("seo.overview.alertsSettings")}
          </Link>
        </div>
        <p className="admin-hint">{t("seo.overview.alertsHint")}</p>

        {alerts.length === 0 ? (
          <p className="mt-3 text-sm text-adm-muted">
            {t("seo.overview.alertsEmpty")}
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex items-start gap-2 rounded-xs border border-adm-line px-3 py-2"
              >
                <AlertTriangle
                  size={14}
                  className="mt-0.5 shrink-0 text-adm-warning"
                  aria-hidden
                />
                <div>
                  {/*
                    The rule's name in the reader's language, then the
                    stored message underneath. The message is written in
                    English at the moment it fires and kept verbatim — it
                    carries the path and the count, and an alert read six
                    months from now should say what happened rather than
                    depend on a message file that has moved on. The
                    translated label is what makes it legible here.
                  */}
                  <p className="text-sm text-adm-text">
                    {t(`reports.alerts.${alert.kind}.label` as never)}
                  </p>
                  <p className="text-xs text-adm-muted">{alert.message}</p>
                  <p className="text-xs text-adm-muted">
                    {alertDayFormat.format(alert.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        Phase 1 drew this as "not connected yet". It is connected now, so
        it shows what Google reports — and keeps a distinct empty state,
        because "nothing synced yet" and "synced, and Google has no data
        for this property" are different problems with different fixes.

        Non-brand leads. Brand searches come from people who already know
        the company, and counted together they make a month of existing
        customers read as the site being found by someone new.
      */}
      <section className={`admin-card ${search.empty ? "border-dashed" : ""}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="admin-label mb-0">{t("seo.overview.googleTitle")}</h2>
          <Link href={`/${locale}/admin/seo/keywords`} className="text-xs text-adm-text underline">
            {t("seo.overview.googleDetail")}
          </Link>
        </div>

        {search.empty ? (
          <p className="admin-hint">{t("seo.overview.googleNoData")}</p>
        ) : (
          <>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xs border border-adm-line px-3 py-2.5">
                <dt className="text-xs uppercase tracking-wide text-adm-muted">
                  {t("seo.overview.googleNonBrandClicks")}
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-adm-text">
                  {searchTotals.nonBrand.clicks}
                </dd>
              </div>
              <div className="rounded-xs border border-adm-line px-3 py-2.5">
                <dt className="text-xs uppercase tracking-wide text-adm-muted">
                  {t("seo.overview.googleBrandClicks")}
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-adm-muted">
                  {searchTotals.brand.clicks}
                </dd>
              </div>
              <div className="rounded-xs border border-adm-line px-3 py-2.5">
                <dt className="text-xs uppercase tracking-wide text-adm-muted">
                  {t("seo.overview.googleImpressions")}
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-adm-muted">
                  {searchTotals.brand.impressions + searchTotals.nonBrand.impressions}
                </dd>
              </div>
            </dl>

            {search.dataUpTo && (
              <p className="admin-hint mt-2">
                {t("seo.overview.googleDataUpTo")} {searchDayFormat.format(search.dataUpTo)}
              </p>
            )}
          </>
        )}
      </section>

      {/* ── Issues + technical checklist ────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="admin-card overflow-hidden p-0!">
          <div className="flex items-center gap-2 border-b border-adm-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-adm-text">
              {t("seo.issuesTitle")}
            </h2>
            <span className="ml-auto text-xs text-adm-muted">
              {t("seo.issuesActionHint")}
            </span>
          </div>

          {audit.issues.length === 0 ? (
            <p className="flex items-center gap-2.5 px-5 py-6 text-sm text-adm-muted">
              <CheckCircle2
                size={16}
                className="shrink-0 text-adm-success"
                aria-hidden
              />
              {t("seo.issuesEmpty")}
            </p>
          ) : (
            <ul>
              {audit.issues.map((issue) => {
                const style = SEVERITY_STYLE[issue.severity];
                const Icon = style.icon;
                const body = (
                  <div className="flex items-start gap-3 border-b border-adm-line px-5 py-3.5 last:border-b-0">
                    <Icon
                      size={15}
                      className="mt-0.5 shrink-0 text-adm-muted"
                      aria-hidden
                    />
                    <span
                      className={`mt-0.5 shrink-0 rounded-xs px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
                    >
                      {t(`seo.severity.${issue.severity}`)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-adm-text">
                        {t(
                          `seo.issues.${issue.key}`,
                          issue.count !== undefined
                            ? { count: issue.count }
                            : undefined,
                        )}
                      </p>
                    </div>
                    {issue.href && (
                      <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-medium text-adm-accent-ink">
                        {t("seo.issuesFix")}
                        <ArrowUpRight size={12} aria-hidden />
                      </span>
                    )}
                  </div>
                );
                return issue.href ? (
                  <li key={issue.id}>
                    <Link
                      href={`/${locale}/admin${issue.href}`}
                      className="block transition-colors hover:bg-adm-text/2"
                    >
                      {body}
                    </Link>
                  </li>
                ) : (
                  <li key={issue.id}>{body}</li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="admin-card p-0!">
          <div className="border-b border-adm-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-adm-text">
              {t("seo.technicalTitle")}
            </h2>
          </div>
          <div className="px-5 py-3">
            {audit.technical.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-2.5 border-b border-adm-line py-2 text-sm last:border-b-0"
              >
                {item.implemented ? (
                  <CheckCircle2
                    size={15}
                    className="shrink-0 text-adm-success"
                    aria-hidden
                  />
                ) : (
                  <XCircle
                    size={15}
                    className="shrink-0 text-adm-danger"
                    aria-hidden
                  />
                )}
                <span
                  className={`flex-1 ${item.implemented ? "text-adm-text" : "text-adm-danger"}`}
                >
                  {t(`seo.technical.${item.key}`)}
                </span>
              </div>
            ))}

            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-adm-muted">
              {t("seo.structuredDataListTitle")}
            </p>
            <div className="flex flex-wrap gap-1.5 pb-1">
              {audit.structuredData.map((s) => (
                <span
                  key={s.type}
                  className={`rounded-xs px-2 py-1 text-[10.5px] font-semibold ${
                    s.implemented
                      ? "bg-adm-success-bg text-adm-success"
                      : "bg-adm-danger-bg text-adm-danger"
                  }`}
                >
                  {s.type}
                  {!s.implemented && " ✗"}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ── Completeness by content type ────────────────────────────── */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="border-b border-adm-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-adm-text">
            {t("seo.completenessTitle")}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-adm-line bg-adm-text/4">
                <th className="admin-th">{t("seo.table.type")}</th>
                <th className="admin-th">{t("seo.table.count")}</th>
                <th className="admin-th">{t("seo.table.title")}</th>
                <th className="admin-th">{t("seo.table.description")}</th>
                <th className="admin-th">{t("seo.table.ogImage")}</th>
                <th className="admin-th">{t("seo.table.schema")}</th>
                <th className="admin-th">{t("seo.table.languages")}</th>
                <th className="admin-th" />
              </tr>
            </thead>
            <tbody>
              {audit.contentTypes.map((row) => {
                const href = CONTENT_ADMIN_HREF[row.key];
                const frac = (n: number) => {
                  const share = pct(n, row.total);
                  return (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-[5px] w-14 overflow-hidden rounded-full bg-adm-text/4">
                        <span
                          className={`block h-full rounded-full ${barColor(share)}`}
                          style={{ width: `${share}%` }}
                        />
                      </span>
                      <span className="tabular-nums text-adm-muted">
                        {n}/{row.total}
                      </span>
                    </span>
                  );
                };
                return (
                  <tr
                    key={row.key}
                    className="border-b border-adm-line text-sm last:border-b-0"
                  >
                    <td className="admin-td font-medium text-adm-text">
                      {t(`seo.contentType.${row.key}`)}
                    </td>
                    <td className="admin-td tabular-nums">{row.total}</td>
                    <td className="admin-td">
                      {row.total > 0 ? frac(row.titleComplete) : "—"}
                    </td>
                    <td className="admin-td">
                      {row.total > 0 ? frac(row.descriptionComplete) : "—"}
                    </td>
                    <td className="admin-td">
                      {row.total > 0 ? frac(row.ogImageComplete) : "—"}
                    </td>
                    <td className="admin-td">
                      {row.schemaType ? (
                        <span className="font-medium text-adm-success">
                          {row.schemaType}
                        </span>
                      ) : (
                        <span className="text-adm-muted">
                          {t("seo.table.noSchema")}
                        </span>
                      )}
                    </td>
                    <td className="admin-td">
                      {row.total > 0 ? frac(row.languageComplete) : "—"}
                    </td>
                    <td className="admin-td">
                      {href && (
                        <Link
                          href={`/${locale}/admin${href}`}
                          className="font-medium text-adm-accent-ink hover:underline"
                        >
                          {t("seo.table.fixLink")}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
