/**
 * app/[locale]/admin/(content)/publishing/translations/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Translation Status — which language is missing what, one row per gap.
 *
 * app/sitemap.ts already declares `alternates.languages` for all four
 * locales, `x-default` included. If a project, article or FAQ has no zh or
 * ru row, that declaration is a promise the site cannot keep: Google
 * follows the hreflang, finds nothing to show, and indexes the gap rather
 * than the content. Nothing before this page said which items those were
 * — lib/locale-completeness.ts's summary gives a percentage per locale,
 * which answers "how much" but not "which one, and where do I fix it."
 * This page is that list.
 *
 * WHY IT IS HERE AND NOT UNDER SEO
 *
 * It was /admin/seo/translations, which cost the (growth) zone a per-route
 * exception — that zone floors at ADMIN, and this screen is for the people
 * who write the copy. The exception existed because the screen was filed
 * in the wrong place, not because the zone needed one: "a project is
 * missing its Russian" is the same question as "is this ready to go live",
 * asked about the same record, by the same person. It is a tab of the
 * publishing hub now, and the exception is gone with it.
 *
 * Role.EDITOR — the (content) zone floors at VIEWER, so this page has to
 * refuse them itself, and lib/admin/nav.ts's EDITOR_UP set on the tab is
 * what stops a VIEWER being shown a tab that would then turn them away.
 *
 * `?group=` narrows the list to one content type. Without it there is no
 * way to link somebody at "the projects that are missing a language" —
 * only at the whole report, where the projects section may be several
 * screens down.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline } from "@/lib/db";
import {
  getTranslationStatusReport,
  translationLocaleTotals,
  LOCALE_NATIVE_NAMES,
  type TranslationGroupKey,
} from "@/lib/locale-completeness";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ group?: string }>;
};

const GROUP_ORDER: readonly TranslationGroupKey[] = [
  "projects",
  "news",
  "events",
  "eBrochures",
  "staticPages",
];

function isGroupKey(value: string | undefined): value is TranslationGroupKey {
  return !!value && (GROUP_ORDER as readonly string[]).includes(value);
}

function barColor(share: number): string {
  if (share === 0) return "bg-emerald-600";
  if (share < 20) return "bg-accent-700";
  return "bg-red-600";
}

export default async function AdminPublishingTranslationsPage(props: Props) {
  const [{ locale }, searchParams] = await Promise.all([props.params, props.searchParams]);

  await requireAdmin(locale, Role.EDITOR);

  const [t, report] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslationStatusReport(),
  ]);

  const activeGroup = isGroupKey(searchParams.group) ? searchParams.group : null;

  const localeTotals = translationLocaleTotals(report);
  const offline = isDatabaseOffline();
  const totalGaps = report.groups.reduce((sum, group) => sum + group.items.length, 0);

  /* The per-locale cards above stay unfiltered on purpose: they are the
     answer to "how far behind is Russian overall", which a filter to one
     content type would silently change the meaning of without changing
     its labels. Only the list below narrows. */
  const shownGroups = activeGroup ? GROUP_ORDER.filter((key) => key === activeGroup) : GROUP_ORDER;

  const base = `/${locale}/admin/publishing/translations`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-primary">{t("seoTranslations.title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t("seoTranslations.subtitle")}</p>
        </div>

        {/* A plain <a>, not next/link: the target is a route handler that
            answers with a Content-Disposition attachment, and a client-side
            navigation to a download is a navigation the router cannot
            complete. The export endpoint itself did not move with this
            page — only the button that points at it. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/admin/seo/translations/export" className="admin-btn" download>
          <Download size={16} aria-hidden />
          {t("seoTranslations.exportCsv")}
        </a>
      </div>

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

      {/* ── Filter by content type ───────────────────────────────────── */}
      {totalGaps > 0 && (
        <nav className="flex flex-wrap gap-1.5" aria-label={t("seoTranslations.filterLabel")}>
          <GroupChip href={base} active={activeGroup === null} label={t("seoTranslations.filterAll")} />
          {GROUP_ORDER.map((key) => {
            const count = report.groups.find((g) => g.group === key)?.items.length ?? 0;
            if (count === 0) return null;

            return (
              <GroupChip
                key={key}
                href={`${base}?group=${key}`}
                active={activeGroup === key}
                label={`${t(`seoTranslations.group.${key}`)} · ${count}`}
              />
            );
          })}
        </nav>
      )}

      {/* ── Gaps by content type ─────────────────────────────────────── */}
      {totalGaps === 0 ? (
        <div className="admin-card py-10 text-center text-sm text-ink-muted">
          {t("seoTranslations.allComplete")}
        </div>
      ) : (
        shownGroups.map((key) => {
          const group = report.groups.find((g) => g.group === key);
          if (!group || group.items.length === 0) return null;

          return (
            <section key={key} className="admin-card overflow-hidden p-0!">
              <div className="flex items-center gap-2 border-b border-primary/10 px-5 py-3.5">
                <h3 className="text-sm font-semibold text-primary">
                  {t(`seoTranslations.group.${key}`)}
                </h3>
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

/** One content-type filter chip. A real link, so the filtered view can be
 *  bookmarked and sent to the person who has to fix it. */
function GroupChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-xs border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-primary/15 text-ink-muted hover:border-primary/40 hover:text-primary",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
