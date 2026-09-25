/**
 * app/[locale]/admin/(growth)/seo/keywords/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The keyword library — tracked phrases, rank/volume/difficulty, keyword
 * cannibalization, and topic clusters. A sibling to /admin/seo (technical
 * SEO), not an extension of it — see lib/admin/keyword-library.ts's header.
 *
 * ADMIN and above, the (growth) zone's floor — which every screen in the
 * zone now shares; its one per-route exception left with the translation
 * report (see that zone layout's header).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { KeyRound } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline } from "@/lib/db";
import { getKeywordLibrary } from "@/lib/admin/keyword-library";
import { intlLocale } from "@/lib/format";
import RescanButton from "@/components/admin/RescanButton";
import KeywordRankImportPanel from "@/components/admin/KeywordRankImportPanel";
import KeywordLibraryTable from "@/components/admin/KeywordLibraryTable";
import { rescanContentLinks, importKeywordRanksCsv } from "./actions";

type Props = { params: Promise<{ locale: string }> };

export default async function KeywordLibraryPage(props: Props) {
  const { locale } = await props.params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, library] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getKeywordLibrary(),
  ]);

  const offline = isDatabaseOffline();

  const lastScanLabel = library.lastScan?.scannedAt
    ? new Intl.DateTimeFormat(intlLocale(locale), {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(library.lastScan.scannedAt)
    : null;

  return (
    <div className="space-y-8">
      {/* An h2 and no back link: the hub layout carries the h1 and the
          tab strip, and a "back to SEO" link above a tab bar that already
          shows where you are is one control too many. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-lg font-semibold text-primary">
            <KeyRound size={18} strokeWidth={1.75} className="text-accent-700" aria-hidden />
            {t("seo.keywords.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {library.lastScan
              ? t("seo.keywords.lastScanHint", { pages: library.lastScan.pagesScanned, date: lastScanLabel ?? "" })
              : t("seo.keywords.neverScanned")}
          </p>
        </div>

        <RescanButton
          action={rescanContentLinks}
          locale={locale}
          label={t("seo.keywords.rescanButton")}
          errorLabel={t("seo.keywords.rescanError")}
        />
      </div>

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="admin-card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t("seo.keywords.kpiTracked")}</p>
          <p className="mt-4 text-3xl font-semibold tabular-nums text-primary">{library.kpis.tracked}</p>
        </div>
        <div className="admin-card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t("seo.keywords.kpiTop10")}</p>
          <p className="mt-4 text-3xl font-semibold tabular-nums text-primary">{library.kpis.top10}</p>
        </div>
        <div className="admin-card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t("seo.keywords.kpiUnmatched")}</p>
          <p className="mt-4 text-3xl font-semibold tabular-nums text-primary">{library.kpis.unmatched}</p>
        </div>
        <div className={`admin-card ${library.kpis.cannibalizing > 0 ? "border-red-200" : ""}`}>
          <p
            className={`text-xs font-medium uppercase tracking-wide ${
              library.kpis.cannibalizing > 0 ? "text-red-700" : "text-ink-muted"
            }`}
          >
            {t("seo.keywords.kpiCannibalizing")}
          </p>
          <p
            className={`mt-4 text-3xl font-semibold tabular-nums ${
              library.kpis.cannibalizing > 0 ? "text-red-700" : "text-primary"
            }`}
          >
            {library.kpis.cannibalizing}
          </p>
        </div>
      </div>

      {/* ── Cannibalization ──────────────────────────────────────────── */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="border-b border-primary/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-primary">{t("seo.keywords.cannibalizationTitle")}</h2>
        </div>
        {library.cannibalization.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">{t("seo.keywords.cannibalizationEmpty")}</p>
        ) : (
          <ul>
            {library.cannibalization.map((flag) => (
              <li
                key={`${flag.keywordId}:${flag.locale}`}
                className="flex flex-wrap items-center gap-2 border-b border-primary/5 px-5 py-3.5 text-sm last:border-b-0"
              >
                <span className="font-medium text-primary">{flag.phrase}</span>
                <span className="text-xs uppercase text-ink-muted">{flag.locale}</span>
                <span className="text-ink-muted">—</span>
                {flag.pages.map((page, index) => (
                  <span key={`${page.contentType}:${page.contentId}`} className="text-ink">
                    {index > 0 && <span className="text-ink-muted"> · </span>}
                    {page.title}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Topic clusters ───────────────────────────────────────────── */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="border-b border-primary/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-primary">{t("seo.keywords.clustersTitle")}</h2>
        </div>
        {library.clusters.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">{t("seo.keywords.clustersEmpty")}</p>
        ) : (
          <ul>
            {library.clusters.map((cluster, index) => (
              <li key={index} className="border-b border-primary/5 px-5 py-4 text-sm last:border-b-0">
                <p className="text-xs uppercase tracking-wide text-ink-muted">{cluster.keywordPhrases.join(", ")}</p>
                <ul className="mt-2 space-y-1">
                  {cluster.members.map((member) => (
                    <li key={`${member.contentType}:${member.contentId}`} className="flex items-center gap-2">
                      <span className="text-ink">{member.title}</span>
                      {cluster.pillar?.contentId === member.contentId && (
                        <span className="rounded-xs bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          {t("seo.keywords.pillarBadge")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {!cluster.pillar && (
                  <p className="mt-2 text-xs text-amber-700">{t("seo.keywords.clusterNoPillar")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <KeywordLibraryTable
        rows={library.rows}
        locale={locale}
        labels={{
          searchPlaceholder: t("seo.keywords.table.search"),
          keyword: t("seo.keywords.table.keyword"),
          locale: t("seo.keywords.table.locale"),
          searchVolume: t("seo.keywords.table.searchVolume"),
          difficulty: t("seo.keywords.table.difficulty"),
          rank: t("seo.keywords.table.rank"),
          change: t("seo.keywords.table.change"),
          matchedPages: t("seo.keywords.table.matchedPages"),
          trend: t("seo.keywords.table.trend"),
          noValue: t("seo.keywords.table.noValue"),
          noPages: t("seo.keywords.table.noPages"),
          primaryBadge: t("seo.keywords.table.primaryBadge"),
        }}
      />

      {/* ── CSV import ───────────────────────────────────────────────── */}
      <KeywordRankImportPanel uiLocale={locale} action={importKeywordRanksCsv} />
    </div>
  );
}
