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
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info, XCircle } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline } from "@/lib/db";
import { getSeoAudit, type ContentTypeKey, type SeoIssue } from "@/lib/seo-audit";
import { getAuditOverview } from "@/lib/seo/audit-report";
import { TrendChart } from "@/components/admin/DashboardCharts";
import { intlLocale } from "@/lib/format";

type Props = { params: Promise<{ locale: string }> };

const CONTENT_ADMIN_HREF: Record<ContentTypeKey, string | null> = {
  projects: "/projects",
  news: "/news",
  events: "/events",
  eBrochures: "/e-brochures",
  static: null,
};

const SEVERITY_STYLE: Record<SeoIssue["severity"], { badge: string; icon: typeof AlertTriangle }> = {
  critical: { badge: "bg-red-50 text-red-700", icon: XCircle },
  warning: { badge: "bg-amber-50 text-amber-800", icon: AlertTriangle },
  minor: { badge: "bg-surface-muted text-ink-muted", icon: Info },
};

/** Share of a fraction, for the little progress bars in the completeness table. */
function pct(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((n / total) * 100);
}

function barColor(share: number): string {
  if (share >= 90) return "bg-emerald-600";
  if (share >= 60) return "bg-accent-700";
  return "bg-red-600";
}

export default async function AdminSeoOverviewPage(props: Props) {
  const { locale } = await props.params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, audit, overview] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getSeoAudit(),
    getAuditOverview(),
  ]);

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

  const structuredMissing = audit.structuredData.filter((s) => !s.implemented).length;

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
      <p className="text-sm text-ink-muted">{t("seo.subtitle", { date: generatedAtLabel })}</p>

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* ── Top-line stats ───────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* The audit's own average, not the aggregate this page used to
            compute. Two numbers both called "the SEO score" is the thing
            the plan warns about most often — one of them is always the
            one somebody quotes, and it was never clear which. */}
        <div className="admin-card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t("seo.score")}
          </p>
          {overview.latest ? (
            <>
              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tabular-nums text-primary">
                  {overview.latest.avgScore}
                </span>
                <span className="text-sm text-ink-muted">/100</span>
                {delta !== null && (
                  <span
                    className={`ml-1 text-xs tabular-nums ${
                      delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-700" : "text-ink-muted"
                    }`}
                  >
                    {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(delta)}
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {t("seo.overview.auditScoreHint", { urls: overview.latest.urlCount })}
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 text-3xl font-semibold text-ink-muted">—</p>
              <p className="mt-1 text-xs text-ink-muted">{t("seo.overview.neverRun")}</p>
            </>
          )}
        </div>

        <div className="admin-card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t("seo.indexablePages")}
          </p>
          <p className="mt-4 flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tabular-nums text-primary">
              {audit.totals.indexableLocalePages}
            </span>
            <span className="text-sm text-ink-muted">/{audit.totals.totalLocalePages}</span>
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {audit.totals.noIndexCount > 0
              ? t("seo.indexablePagesHint", { count: audit.totals.noIndexCount })
              : t("seo.indexablePagesHintNone")}
          </p>
        </div>

        <div className={`admin-card ${audit.issues.length > 0 ? "border-red-200" : ""}`}>
          <p
            className={`text-xs font-medium uppercase tracking-wide ${
              audit.issues.length > 0 ? "text-red-700" : "text-ink-muted"
            }`}
          >
            {t("seo.issuesToFix")}
          </p>
          <p className="mt-4">
            <span
              className={`text-3xl font-semibold tabular-nums ${
                audit.issues.length > 0 ? "text-red-700" : "text-primary"
              }`}
            >
              {audit.issues.length}
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {t("seo.issuesBreakdown", { critical: counts.critical, warning: counts.warning, minor: counts.minor })}
          </p>
          {overview.latest && (
            <p className="mt-2 text-xs">
              <Link href={`/${locale}/admin/seo/audit`} className="text-ink-muted underline hover:text-primary">
                {t("seo.overview.urlsFailing", {
                  count: overview.latest.urlCount - overview.latest.passAllCount,
                })}
              </Link>
            </p>
          )}
        </div>

        <div className="admin-card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t("seo.structuredData")}
          </p>
          <p className="mt-4 flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tabular-nums text-primary">
              {audit.structuredData.length - structuredMissing}
            </span>
            <span className="text-sm text-ink-muted">/{audit.structuredData.length}</span>
          </p>
          <p className="mt-1 text-xs text-ink-muted">
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
      </div>

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

      {/* Rule 8's "credentials not set yet" state. Everything Google knows
          — clicks, positions, index coverage — arrives in phase 4, and an
          empty card that says why is not the same as a broken one. */}
      <section className="admin-card border-dashed">
        <h2 className="admin-label">{t("seo.overview.googleTitle")}</h2>
        <p className="admin-hint">{t("seo.overview.googleNotConnected")}</p>
      </section>

      {/* ── Issues + technical checklist ────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="admin-card overflow-hidden p-0!">
          <div className="flex items-center gap-2 border-b border-primary/10 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-primary">{t("seo.issuesTitle")}</h2>
            <span className="ml-auto text-xs text-ink-muted">{t("seo.issuesActionHint")}</span>
          </div>

          {audit.issues.length === 0 ? (
            <p className="flex items-center gap-2.5 px-5 py-6 text-sm text-ink-muted">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" aria-hidden />
              {t("seo.issuesEmpty")}
            </p>
          ) : (
            <ul>
              {audit.issues.map((issue) => {
                const style = SEVERITY_STYLE[issue.severity];
                const Icon = style.icon;
                const body = (
                  <div className="flex items-start gap-3 border-b border-primary/5 px-5 py-3.5 last:border-b-0">
                    <Icon size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
                    <span
                      className={`mt-0.5 shrink-0 rounded-xs px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
                    >
                      {t(`seo.severity.${issue.severity}`)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-primary">
                        {t(`seo.issues.${issue.key}`, issue.count !== undefined ? { count: issue.count } : undefined)}
                      </p>
                    </div>
                    {issue.href && (
                      <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-medium text-accent-700">
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
                      className="block transition-colors hover:bg-primary-900/2"
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
          <div className="border-b border-primary/10 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-primary">{t("seo.technicalTitle")}</h2>
          </div>
          <div className="px-5 py-3">
            {audit.technical.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-2.5 border-b border-primary/5 py-2 text-sm last:border-b-0"
              >
                {item.implemented ? (
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <XCircle size={15} className="shrink-0 text-red-600" aria-hidden />
                )}
                <span className={`flex-1 ${item.implemented ? "text-ink" : "text-red-700"}`}>
                  {t(`seo.technical.${item.key}`)}
                </span>
              </div>
            ))}

            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {t("seo.structuredDataListTitle")}
            </p>
            <div className="flex flex-wrap gap-1.5 pb-1">
              {audit.structuredData.map((s) => (
                <span
                  key={s.type}
                  className={`rounded-xs px-2 py-1 text-[10.5px] font-semibold ${
                    s.implemented ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
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
        <div className="border-b border-primary/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-primary">{t("seo.completenessTitle")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-primary/10 bg-surface-muted">
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
                      <span className="inline-block h-[5px] w-14 overflow-hidden rounded-full bg-surface-muted">
                        <span className={`block h-full rounded-full ${barColor(share)}`} style={{ width: `${share}%` }} />
                      </span>
                      <span className="tabular-nums text-ink-muted">
                        {n}/{row.total}
                      </span>
                    </span>
                  );
                };
                return (
                  <tr key={row.key} className="border-b border-primary/5 text-sm last:border-b-0">
                    <td className="admin-td font-medium text-ink">{t(`seo.contentType.${row.key}`)}</td>
                    <td className="admin-td tabular-nums">{row.total}</td>
                    <td className="admin-td">{row.total > 0 ? frac(row.titleComplete) : "—"}</td>
                    <td className="admin-td">{row.total > 0 ? frac(row.descriptionComplete) : "—"}</td>
                    <td className="admin-td">{row.total > 0 ? frac(row.ogImageComplete) : "—"}</td>
                    <td className="admin-td">
                      {row.schemaType ? (
                        <span className="font-medium text-emerald-700">{row.schemaType}</span>
                      ) : (
                        <span className="text-ink-muted">{t("seo.table.noSchema")}</span>
                      )}
                    </td>
                    <td className="admin-td">{row.total > 0 ? frac(row.languageComplete) : "—"}</td>
                    <td className="admin-td">
                      {href && (
                        <Link
                          href={`/${locale}/admin${href}`}
                          className="font-medium text-accent-700 hover:underline"
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
