/**
 * lib/seo-audit.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Computes the numbers behind /admin/seo — a live snapshot of the site's
 * on-page SEO health, built from the same tables the public pages read
 * (ProjectTranslation.metaDescription, EventTranslation.noIndex, the
 * Redirect/NotFoundHit tables from the redirect system, …) rather than a
 * separately tracked metric. Nothing here is cached: the datasets involved
 * are a few dozen rows per content type, cheap enough to recompute on every
 * page load, and a stale "23 pages missing a description" count would be
 * actively misleading on a page whose entire point is "fix this now".
 *
 * What's a hard-coded fact vs. a live query, and why:
 *   - Which JSON-LD types the codebase emits, and which sitewide technical
 *     checks (canonical tags, hreflang, robots.txt staging guard, …) are
 *     wired up — these describe code that either exists or doesn't. They
 *     don't change per request, so they're recorded here as constants
 *     rather than re-derived by grepping the app tree on every page load.
 *     Keep this list honest: update it in the same commit that adds or
 *     removes a schema type or a metadata field.
 *   - Everything about content (missing descriptions, language gaps,
 *     noindex counts, redirect/404 counts) is queried live — it changes
 *     every time someone edits a project or a visitor hits a dead link.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { getOverriddenKeys } from "@/lib/settings";
import { locales } from "@/i18n";
import { TITLE_MAX_LENGTH } from "@/lib/seo/rules/title-length";

const LOCALE_COUNT = locales.length;

/* Google truncates a rendered title around here for most queries. Imported
   from the rule that owns it rather than restated: this dashboard and the
   per-URL audit disagreeing about where "too long" begins is exactly the
   drift lib/seo/rules exists to end. */
const TITLE_BUDGET = TITLE_MAX_LENGTH;

/**
 * The 15 statically-rendered pages (home, about, contact, the six list
 * pages, …) whose alternates/canonical/BreadcrumbList wiring was fixed by
 * hand in this same SEO pass — see app/[locale]/layout.tsx and the list
 * pages under app/[locale]/(site). They carry no DB row, so their
 * completeness can't be queried; it's recorded here as a fact about the
 * code, matching the content-type table's shape so the dashboard reads as
 * one list rather than "the real data, plus an asterisk".
 */
const STATIC_PAGE_COUNT = 15;

export type ContentTypeKey = "projects" | "news" | "events" | "eBrochures" | "static";

export type ContentTypeAudit = {
  key: ContentTypeKey;
  total: number;
  titleComplete: number;
  descriptionComplete: number;
  ogImageComplete: number;
  languageComplete: number;
  /** null = this content type has no JSON-LD of its own (e-brochures). */
  schemaType: string | null;
};

export type SeoIssue = {
  id: string;
  severity: "critical" | "warning" | "minor";
  /** i18n key suffix under admin.seo.issues.* — the page owns the copy. */
  key: string;
  count?: number;
  href?: string;
};

export type SeoAudit = {
  generatedAt: Date;
  contentTypes: ContentTypeAudit[];
  totals: {
    /** Published items across projects/news/events/e-brochures. */
    totalItems: number;
    /** Locale-level pages: sum of translation rows + static pages × 4. */
    totalLocalePages: number;
    indexableLocalePages: number;
    noIndexCount: number;
    missingDescriptionCount: number;
    missingOgImageCount: number;
    titleTooLongCount: number;
    languageIncompleteCount: number;
  };
  redirects: { active: number; openNotFoundHits: number };
  structuredData: { type: string; implemented: boolean }[];
  technical: { key: string; implemented: boolean; detail?: string }[];
  issues: SeoIssue[];
  /** 0-100, see computeScore() below for the (documented) weighting. */
  score: number;
};

/**
 * What app/*.ts and components/**\/*.tsx actually emit today — verified by
 * grepping every literal "@type" in the codebase while building this
 * dashboard. BreadcrumbList moved from missing to implemented in this same
 * SEO pass (app/[locale]/(site)/**\/page.tsx); VideoObject and
 * AggregateRating are the two schema types the site has content for
 * (project hero videos, no rating source yet) but no markup emitting yet.
 *
 * NewsArticle/BlogPosting/Report replace the single "Article" row from
 * before lib/article-schema.ts existed: a news article's @type is now
 * driven by its own schemaType column (an open string — see the
 * schema.prisma comment on NewsArticle.schemaType), so all three
 * Article-family subtypes the dropdown offers can appear in real output.
 */
const STRUCTURED_DATA: { type: string; implemented: boolean }[] = [
  { type: "Organization", implemented: true },
  { type: "RealEstateAgent", implemented: true },
  { type: "RealEstateListing", implemented: true },
  { type: "NewsArticle", implemented: true },
  { type: "BlogPosting", implemented: true },
  { type: "Report", implemented: true },
  { type: "Event", implemented: true },
  { type: "FAQPage", implemented: true },
  { type: "BreadcrumbList", implemented: true },
  { type: "VideoObject", implemented: false },
  { type: "AggregateRating", implemented: false },
];

const EMPTY_AUDIT: SeoAudit = {
  generatedAt: new Date(0),
  contentTypes: [],
  totals: {
    totalItems: 0,
    totalLocalePages: 0,
    indexableLocalePages: 0,
    noIndexCount: 0,
    missingDescriptionCount: 0,
    missingOgImageCount: 0,
    titleTooLongCount: 0,
    languageIncompleteCount: 0,
  },
  redirects: { active: 0, openNotFoundHits: 0 },
  structuredData: STRUCTURED_DATA,
  technical: [],
  issues: [],
  score: 0,
};

type Translation = {
  locale: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
};

function auditRows(
  key: ContentTypeKey,
  schemaType: string | null,
  items: { hasImage: boolean; translations: Translation[] }[],
): { audit: ContentTypeAudit; missingDescription: number; titleTooLong: number; languageIncomplete: number; ogMissing: number } {
  let titleComplete = 0;
  let descriptionComplete = 0;
  let ogImageComplete = 0;
  let languageComplete = 0;
  let missingDescription = 0;
  let titleTooLong = 0;
  let languageIncomplete = 0;

  for (const item of items) {
    const rowsOk = item.translations.length > 0;
    const everyRowHasTitle = rowsOk && item.translations.every((t) => (t.metaTitle || t.title || "").trim().length > 0);
    if (everyRowHasTitle) titleComplete += 1;

    const everyRowHasDescription =
      rowsOk && item.translations.every((t) => (t.metaDescription ?? "").trim().length > 0);
    if (everyRowHasDescription) descriptionComplete += 1;
    missingDescription += item.translations.filter((t) => (t.metaDescription ?? "").trim().length === 0).length;

    if (item.hasImage) ogImageComplete += 1;

    if (item.translations.length === LOCALE_COUNT) languageComplete += 1;
    else languageIncomplete += 1;

    titleTooLong += item.translations.filter((t) => (t.metaTitle || t.title || "").trim().length > TITLE_BUDGET).length;
  }

  return {
    audit: {
      key,
      total: items.length,
      titleComplete,
      descriptionComplete,
      ogImageComplete,
      languageComplete,
      schemaType,
    },
    missingDescription,
    titleTooLong,
    languageIncomplete,
    ogMissing: items.length - ogImageComplete,
  };
}

/**
 * Weighted from 100. Each deduction targets a specific, real signal —
 * there's no attempt to reproduce a "industry standard" scoring model,
 * just a rough, defensible ordering of "how bad is this" so the top-line
 * number moves in the right direction as issues get fixed. A deliberate
 * per-page noindex is never penalised: that's a content decision, not a
 * defect.
 */
function computeScore(totals: SeoAudit["totals"], redirects: SeoAudit["redirects"], technical: SeoAudit["technical"], structuredData: SeoAudit["structuredData"]): number {
  let score = 100;
  score -= Math.min(20, totals.missingDescriptionCount * 0.6);
  score -= Math.min(10, totals.titleTooLongCount * 0.5);
  score -= Math.min(10, totals.languageIncompleteCount * 0.5);
  score -= Math.min(15, redirects.openNotFoundHits * 1.5);
  score -= technical.filter((t) => !t.implemented).length * 3;
  score -= structuredData.filter((t) => !t.implemented).length * 2;
  return Math.max(0, Math.round(score));
}

export async function getSeoAudit(): Promise<SeoAudit> {
  return safeQuery(
    "getSeoAudit",
    async () => {
      const [projects, newsArticles, events, eBrochures, activeRedirects, openNotFoundHits, overriddenSettings] =
        await Promise.all([
          prisma.project.findMany({
            where: { deletedAt: null, isPublished: true },
            select: {
              heroImageUrl: true,
              translations: {
                select: { locale: true, name: true, metaTitle: true, metaDescription: true, noIndex: true },
              },
            },
          }),
          prisma.newsArticle.findMany({
            where: { deletedAt: null, isPublished: true },
            select: {
              coverImageUrl: true,
              schemaType: true,
              translations: {
                select: { locale: true, title: true, metaTitle: true, metaDescription: true, noIndex: true },
              },
            },
          }),
          prisma.event.findMany({
            where: { isPublished: true },
            select: {
              coverImageUrl: true,
              translations: {
                select: { locale: true, title: true, metaTitle: true, metaDescription: true, noIndex: true },
              },
            },
          }),
          prisma.eBrochure.findMany({
            where: { isPublished: true },
            select: {
              coverImageUrl: true,
              translations: { select: { locale: true, title: true, description: true } },
            },
          }),
          prisma.redirect.count({ where: { isActive: true } }),
          prisma.notFoundHit.count(),
          getOverriddenKeys(),
        ]);

      const projectRows = auditRows(
        "projects",
        "RealEstateListing",
        projects.map((p) => ({
          hasImage: Boolean(p.heroImageUrl),
          translations: p.translations.map((t) => ({ locale: t.locale, title: t.name, metaTitle: t.metaTitle, metaDescription: t.metaDescription })),
        })),
      );
      // Reported from what's actually in the table, not a static label —
      // same "don't guess" rule this dashboard applies everywhere else.
      // Falls back to the column's own default when no article is
      // published yet, since there's nothing real to report.
      const newsSchemaTypes = [...new Set(newsArticles.map((n) => n.schemaType ?? "NewsArticle"))].sort();
      const newsSchemaTypeLabel = newsSchemaTypes.length > 0 ? newsSchemaTypes.join(" / ") : "NewsArticle";

      const newsRows = auditRows(
        "news",
        newsSchemaTypeLabel,
        newsArticles.map((n) => ({
          hasImage: Boolean(n.coverImageUrl),
          translations: n.translations.map((t) => ({ locale: t.locale, title: t.title, metaTitle: t.metaTitle, metaDescription: t.metaDescription })),
        })),
      );
      const eventRows = auditRows(
        "events",
        "Event",
        events.map((e) => ({
          hasImage: Boolean(e.coverImageUrl),
          translations: e.translations.map((t) => ({ locale: t.locale, title: t.title, metaTitle: t.metaTitle, metaDescription: t.metaDescription })),
        })),
      );
      // E-brochures have no metaTitle/metaDescription/noIndex columns (see
      // EBrochureTranslation) — the PDF itself is the content, so "meta
      // description" here stands in for the admin-authored description
      // field, and there's no per-locale noindex switch to count.
      const brochureRows = auditRows(
        "eBrochures",
        null,
        eBrochures.map((b) => ({
          hasImage: Boolean(b.coverImageUrl),
          translations: b.translations.map((t) => ({ locale: t.locale, title: t.title, metaTitle: null, metaDescription: t.description })),
        })),
      );

      const noIndexCount =
        projects.reduce((n, p) => n + p.translations.filter((t) => t.noIndex).length, 0) +
        newsArticles.reduce((n, a) => n + a.translations.filter((t) => t.noIndex).length, 0) +
        events.reduce((n, e) => n + e.translations.filter((t) => t.noIndex).length, 0);

      const totalItems = projects.length + newsArticles.length + events.length + eBrochures.length;
      const totalLocalePages =
        projects.reduce((n, p) => n + p.translations.length, 0) +
        newsArticles.reduce((n, a) => n + a.translations.length, 0) +
        events.reduce((n, e) => n + e.translations.length, 0) +
        eBrochures.reduce((n, b) => n + b.translations.length, 0) +
        STATIC_PAGE_COUNT * LOCALE_COUNT;

      const missingDescriptionCount =
        projectRows.missingDescription + newsRows.missingDescription + eventRows.missingDescription;
      const titleTooLongCount = projectRows.titleTooLong + newsRows.titleTooLong + eventRows.titleTooLong;
      const languageIncompleteCount =
        projectRows.languageIncomplete + newsRows.languageIncomplete + eventRows.languageIncomplete + brochureRows.languageIncomplete;
      const missingOgImageCount = projectRows.ogMissing + newsRows.ogMissing + eventRows.ogMissing + brochureRows.ogMissing;

      const searchConsoleVerified = overriddenSettings.includes("analytics.googleSiteVerification");

      const technical: SeoAudit["technical"] = [
        { key: "sitemapFromDb", implemented: true },
        { key: "robotsStagingGuard", implemented: true },
        { key: "canonicalEveryPage", implemented: true },
        { key: "hreflang4Locales", implemented: true },
        { key: "hreflangXDefault", implemented: true },
        { key: "openGraphTwitter", implemented: true },
        { key: "searchConsoleVerification", implemented: searchConsoleVerified },
        { key: "redirectSystem", implemented: true },
        { key: "imageSitemap", implemented: false },
      ];

      const redirects = { active: activeRedirects, openNotFoundHits };

      const issues: SeoIssue[] = [];
      if (redirects.openNotFoundHits > 0) {
        issues.push({
          id: "not-found-hits",
          severity: "critical",
          key: "notFoundHits",
          count: redirects.openNotFoundHits,
          href: "/admin/seo/urls",
        });
      }
      if (projectRows.missingDescription > 0) {
        issues.push({ id: "desc-projects", severity: "warning", key: "missingDescriptionProjects", count: projectRows.missingDescription, href: "/admin/projects" });
      }
      if (newsRows.missingDescription > 0) {
        issues.push({ id: "desc-news", severity: "warning", key: "missingDescriptionNews", count: newsRows.missingDescription, href: "/admin/news" });
      }
      if (eventRows.missingDescription > 0) {
        issues.push({ id: "desc-events", severity: "warning", key: "missingDescriptionEvents", count: eventRows.missingDescription, href: "/admin/events" });
      }
      if (!searchConsoleVerified) {
        issues.push({ id: "search-console", severity: "warning", key: "searchConsoleNotVerified", href: "/admin/seo/defaults" });
      }
      if (languageIncompleteCount > 0) {
        // The translation-status report lists exactly these items, one
        // row per missing locale, with a link to each one's editor.
        issues.push({ id: "language-gaps", severity: "warning", key: "languageIncomplete", count: languageIncompleteCount, href: "/admin/publishing/translations" });
      }
      if (titleTooLongCount > 0) {
        issues.push({ id: "title-length", severity: "minor", key: "titleTooLong", count: titleTooLongCount });
      }
      if (missingOgImageCount > 0) {
        issues.push({ id: "og-image", severity: "minor", key: "missingOgImage", count: missingOgImageCount });
      }
      issues.push({ id: "image-sitemap", severity: "minor", key: "imageSitemapMissing" });

      const severityRank: Record<SeoIssue["severity"], number> = { critical: 0, warning: 1, minor: 2 };
      issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

      const totals: SeoAudit["totals"] = {
        totalItems,
        totalLocalePages,
        indexableLocalePages: totalLocalePages - noIndexCount,
        noIndexCount,
        missingDescriptionCount,
        missingOgImageCount,
        titleTooLongCount,
        languageIncompleteCount,
      };

      const staticTypeAudit: ContentTypeAudit = {
        key: "static",
        total: STATIC_PAGE_COUNT,
        titleComplete: STATIC_PAGE_COUNT,
        descriptionComplete: STATIC_PAGE_COUNT,
        ogImageComplete: STATIC_PAGE_COUNT,
        languageComplete: STATIC_PAGE_COUNT,
        schemaType: "Organization + FAQPage",
      };

      return {
        generatedAt: new Date(),
        contentTypes: [projectRows.audit, newsRows.audit, eventRows.audit, brochureRows.audit, staticTypeAudit],
        totals,
        redirects,
        structuredData: STRUCTURED_DATA,
        technical,
        issues,
        score: computeScore(totals, redirects, technical, STRUCTURED_DATA),
      };
    },
    EMPTY_AUDIT,
  );
}
