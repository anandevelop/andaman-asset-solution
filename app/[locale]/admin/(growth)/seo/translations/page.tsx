/**
 * app/[locale]/admin/(growth)/seo/translations/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Translation Status — which language is missing what, one row per gap.
 *
 * app/sitemap.ts already declares `alternates.languages` for all four
 * locales, `x-default` included. If a project, article or FAQ has no zh or
 * ru row, that declaration is a promise the site cannot keep: Google
 * follows the hreflang, finds nothing to show, and indexes the gap rather
 * than the content. Nothing before this page said which items those were
 * — the dashboard's locale-completeness card (lib/locale-completeness.ts)
 * gives a percentage per locale, which answers "how much" but not "which
 * one, and where do I fix it." This page is that list.
 *
 * Role.EDITOR, not ADMIN — the (growth) zone's floor everywhere else.
 * lib/admin/nav.ts's EDITOR_UP set and this page's own guard exist for
 * exactly this route; see the ROUTE_EXCEPTIONS entry in this zone's
 * layout.tsx and its header comment for why it can only ever loosen, and
 * only for this one path.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Download, Languages } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline } from "@/lib/db";
import {
  getTranslationStatusReport,
  translationLocaleTotals,
  LOCALE_NATIVE_NAMES,
  type TranslationGroupKey,
} from "@/lib/locale-completeness";

type Props = { params: Promise<{ locale: string }> };

const GROUP_ORDER: readonly TranslationGroupKey[] = [
  "projects",
  "news",
  "events",
  "eBrochures",
  "staticPages",
];

function barColor(share: number): string {
  if (share === 0) return "bg-emerald-600";
  if (share < 20) return "bg-accent-700";
  return "bg-red-600";
}

export default async function AdminSeoTranslationsPage(props: Props) {
  const { locale } = await props.params;

  await requireAdmin(locale, Role.EDITOR);

  const [t, report] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslationStatusReport(),
  ]);

  const localeTotals = translationLocaleTotals(report);
  const offline = isDatabaseOffline();
  const totalGaps = report.groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="admin-section-title">{t("nav.seo")}</p>
          <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-semibold text-primary sm:text-3xl">
            <Languages size={22} strokeWidth={1.75} className="text-accent-700" aria-hidden />
            {t("seoTranslations.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("seoTranslations.subtitle")}</p>
        </div>

        <a href={`/api/admin/seo/translations/export`} className="admin-btn">
          <Download size={16} aria-hidden />
          {t("seoTranslations.exportCsv")}
        </a>
      </header>

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* ── Per-locale summary ───────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {localeTotals.map((row) => {
          const share = row.total === 0 ? 0 : Math.round((row.missing / row.total) * 100);
          return (
            <div key={row.locale} className="admin-card">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {LOCALE_NATIVE_NAMES[row.locale] ?? row.locale}
              </p>
              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tabular-nums text-primary">{row.missing}</span>
                <span className="text-sm text-ink-muted">
                  {t("seoTranslations.missingOf", { total: row.total })}
                </span>
              </p>
              <span className="mt-3 block h-[5px] w-full overflow-hidden rounded-full bg-surface-muted">
                <span
                  className={`block h-full rounded-full ${barColor(share)}`}
                  style={{ width: `${Math.max(share, 3)}%` }}
                />
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Gaps by content type ─────────────────────────────────────── */}
      {totalGaps === 0 ? (
        <div className="admin-card py-10 text-center text-sm text-ink-muted">
          {t("seoTranslations.allComplete")}
        </div>
      ) : (
        GROUP_ORDER.map((key) => {
          const group = report.groups.find((g) => g.group === key);
          if (!group || group.items.length === 0) return null;

          return (
            <section key={key} className="admin-card overflow-hidden p-0!">
              <div className="flex items-center gap-2 border-b border-primary/10 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-primary">
                  {t(`seoTranslations.group.${key}`)}
                </h2>
                <span className="ml-auto text-xs text-ink-muted">
                  {t("seoTranslations.groupCount", { count: group.items.length })}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-primary/10 bg-surface-muted">
                      <th className="admin-th">{t("seoTranslations.table.item")}</th>
                      <th className="admin-th">{t("seoTranslations.table.missing")}</th>
                      <th className="admin-th" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-primary/5 text-sm last:border-b-0"
                      >
                        <td className="admin-td font-medium text-ink">{item.label}</td>
                        <td className="admin-td">
                          <div className="flex flex-wrap gap-1.5">
                            {item.missingLocales.map((missingLocale) => (
                              <span
                                key={missingLocale}
                                className="rounded-xs bg-red-50 px-2 py-0.5 text-[10.5px] font-semibold text-red-700"
                              >
                                {LOCALE_NATIVE_NAMES[missingLocale] ?? missingLocale}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="admin-td">
                          <Link
                            href={`/${locale}/admin${item.editHref}`}
                            className="font-medium text-accent-700 hover:underline"
                          >
                            {t("seoTranslations.table.fixLink")}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
