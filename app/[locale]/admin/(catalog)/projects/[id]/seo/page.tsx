/**
 * app/[locale]/admin/projects/[id]/seo/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "SEO รายหน้า" (Seo.dc.html) — how one project's page introduces itself to
 * Google and to whoever pastes its link into LINE or WhatsApp.
 *
 * Its own route rather than a section of the overview form, for the same
 * reason the content tab is: this screen needs every language at once and
 * a preview beside the fields, which the one-language-at-a-time overview
 * form cannot show.
 *
 * The checklist below is computed in lib/admin/page-seo.ts from the same
 * row the public page renders from — see that file's header for why the
 * mockup's Search Console strip (average position, clicks, impressions) is
 * not here.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Check, ExternalLink, X } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { siteConfig } from "@/config/site";
import { LOCALE_DISPLAY_ORDER, type Locale } from "@/i18n";
import { getPageSeo } from "@/lib/admin/page-seo";
import ProjectHubTabs from "@/components/admin/ProjectHubTabs";
import PageSeoEditor, { type LocaleSeo } from "@/components/admin/PageSeoEditor";

type Props = { params: Promise<{ locale: string; id: string }> };

const LOCALE_LABELS: Record<Locale, string> = {
  th: "ไทย",
  en: "English",
  zh: "中文",
  ru: "Русский",
};

export default async function AdminProjectSeoPage(props: Props) {
  const { locale, id: projectId } = await props.params;

  // VIEWER may open this to see how the page introduces itself; saving
  // stays behind a disabled fieldset for anyone below EDITOR.
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });

  const [project, seo] = await Promise.all([
    safeQuery(
      "admin:project:seo:header",
      () =>
        prisma.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: { id: true, nameEn: true, nameTh: true, isPublished: true },
        }),
      undefined,
    ),
    getPageSeo(projectId),
  ]);

  if (!project || !seo) notFound();

  const projectName = locale === "th" ? project.nameTh : project.nameEn;

  // Ordered the way the admin sidebar orders languages everywhere else —
  // Thai first, because that is the language this copy gets written in.
  const perLocale: LocaleSeo[] = LOCALE_DISPLAY_ORDER.map((code) => {
    const row = seo.perLocale.find((entry) => entry.locale === code);
    return {
      locale: code,
      label: LOCALE_LABELS[code],
      title: row?.title ?? "",
      description: row?.description ?? "",
      keywords: row?.keywords ?? [],
      noIndex: row?.noIndex ?? false,
      complete: row?.complete ?? false,
    };
  });

  const failed = seo.checks.filter((check) => !check.passed);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/${locale}/admin/projects`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("projects.title")}
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold text-primary sm:text-3xl">{projectName}</h1>
          <span
            className={
              project.isPublished
                ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
            }
          >
            {project.isPublished ? t("common.published") : t("common.draft")}
          </span>

          <Link
            href={`/${locale}/projects/${seo.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
          >
            <ExternalLink size={13} aria-hidden />
            {t("pageSeo.viewLivePage")}
          </Link>
        </div>
      </header>

      <ProjectHubTabs
        locale={locale}
        projectId={project.id}
        active="seo"
      />

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* ── Checklist ─────────────────────────────────────────────────
          Only what is actually wrong. A list of green ticks reads as
          decoration and pushes the two real problems below the fold. */}
      <section className="admin-card">
        {failed.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-800">
            <Check size={15} aria-hidden />
            {t("pageSeo.allChecksPassed")}
          </p>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-primary">
              {t("pageSeo.checklistTitle", { count: failed.length })}
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {failed.map((check) => (
                <li
                  key={`${check.key}:${check.locale ?? "-"}`}
                  className="flex items-start gap-2 text-sm text-ink"
                >
                  <X size={14} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
                  <span>
                    {t(`pageSeo.checks.${check.key}`)}
                    {check.locale && (
                      <span className="text-ink-muted"> · {LOCALE_LABELS[check.locale as Locale]}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <fieldset disabled={!canWrite} className="contents">
      <PageSeoEditor
        adminLocale={locale}
        projectId={project.id}
        slug={seo.slug}
        siteOrigin={siteConfig.url}
        perLocale={perLocale}
        ogImageUrl={seo.ogImageUrl ?? ""}
        heroImageUrl={seo.heroImageUrl}
        canonicalUrl={seo.canonicalUrl ?? ""}
        sitemapPriority={seo.sitemapPriority}
        sitemapChangeFreq={seo.sitemapChangeFreq ?? ""}
        structuredData={seo.structuredData.map((entry) => ({
          type: entry.type,
          detail: t(`pageSeo.structured.${entry.detailKey}`),
          emitted: entry.emitted,
        }))}
        labels={{
          sectionTitle: t("pageSeo.sectionTitle"),
          keywords: t("pageSeo.keywords"),
          keywordsHint: t("pageSeo.keywordsHint"),
          addKeyword: t("pageSeo.addKeyword"),
          title: t("projects.metaTitle"),
          description: t("projects.metaDescription"),
          tooLong: t("pageSeo.tooLong"),
          url: t("pageSeo.url"),
          urlHint: t("pageSeo.urlHint"),
          canonical: t("pageSeo.canonical"),
          canonicalHint: t("pageSeo.canonicalHint"),
          shareImage: t("pageSeo.shareImage"),
          shareImageFallback: t("pageSeo.shareImageFallback"),
          sitemapPriority: t("pageSeo.sitemapPriority"),
          sitemapChangeFreq: t("pageSeo.sitemapChangeFreq"),
          useDefault: t("pageSeo.useDefault"),
          noIndex: t("pageSeo.noIndex"),
          noIndexHint: t("pageSeo.noIndexHint"),
          save: t("common.save"),
          saved: t("pageSeo.saved"),
          error: t("common.error"),
          canonicalNotAbsolute: t("pageSeo.canonicalNotAbsolute"),
          serpTitle: t("pageSeo.serpTitle"),
          serpEmpty: t("pageSeo.serpEmpty"),
          shareTitle: t("pageSeo.shareTitle"),
          structuredTitle: t("pageSeo.structuredTitle"),
          notEmitted: t("pageSeo.notEmitted"),
        }}
      />
      </fieldset>
    </div>
  );
}
