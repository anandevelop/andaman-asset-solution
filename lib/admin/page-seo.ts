import "server-only";

/**
 * lib/admin/page-seo.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The per-page SEO tab's read side (Seo.dc.html) — the checklist, and the
 * inventory of structured data the page really emits.
 *
 * EVERY ROW HERE IS DERIVED, NOT DECLARED.
 *
 * A structured-data panel that lists what the developer intended is worse
 * than no panel: it goes stale the first time a schema block is edited and
 * then quietly reassures everyone. So the inventory below is computed from
 * the same row the public page renders from, with the same conditions —
 * GeoCoordinates only appears when the project actually has coordinates,
 * because that is exactly when the page emits it (see the JSON-LD block in
 * app/[locale]/(site)/projects/[slug]/page.tsx).
 *
 * The same rule is why there are no Search Console figures on this screen.
 * Average position, clicks and impressions need Google's API and an OAuth
 * connection that this application does not have; printing plausible
 * numbers beside real ones would make the real ones untrustworthy too.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { locales, type Locale } from "@/i18n";
// Defined in a file of its own so the client-side editor can use the same
// numbers without importing this "server-only" module. See lib/seo-limits.ts.
import { SEO_LIMITS } from "@/lib/seo-limits";

export type SeoCheck = {
  key: string;
  passed: boolean;
  /** Which language the failure is about, when it is language-specific. */
  locale?: string;
};

export type StructuredDataEntry = {
  type: string;
  /** i18n key suffix describing what it carries. */
  detailKey: string;
  emitted: boolean;
};

export type PageSeoLocaleData = {
  locale: string;
  title: string;
  description: string;
  keywords: string[];
  noIndex: boolean;
  /** Has a title and a description — what the language tab colours on. */
  complete: boolean;
};

export type PageSeoView = {
  slug: string;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  sitemapPriority: number | null;
  sitemapChangeFreq: string | null;
  heroImageUrl: string | null;
  hasCoordinates: boolean;
  perLocale: PageSeoLocaleData[];
  checks: SeoCheck[];
  structuredData: StructuredDataEntry[];
};

const trimmed = (value: string | null | undefined) => (value ?? "").trim();

/**
 * What the public project page puts in its JSON-LD, for this project.
 *
 * Kept deliberately close to the page's own markup — if a block is added
 * there, it belongs here too, and the comment above the page's script tag
 * says so.
 */
function structuredDataFor(project: {
  latitude: unknown;
  longitude: unknown;
}): StructuredDataEntry[] {
  return [
    // Always emitted: the page's root JSON-LD object.
    { type: "RealEstateListing", detailKey: "realEstateListing", emitted: true },
    {
      type: "Place + GeoCoordinates",
      detailKey: "geo",
      // The page nests GeoCoordinates inside the listing's address only
      // when both coordinates are set.
      emitted: project.latitude !== null && project.longitude !== null,
    },
    { type: "RealEstateAgent", detailKey: "agent", emitted: true },
    {
      type: "BreadcrumbList",
      detailKey: "breadcrumb",
      /*
        Emitted, via lib/seo.ts's breadcrumbList() helper — the project
        page renders it as its own <JsonLd> block beside the listing.
        Worth stating because the design this screen came from listed
        Breadcrumb as missing: it was, and it is not any more, and a
        checklist that repeated the design rather than reading the code
        would be telling somebody to fix a thing that is already done.
      */
      emitted: true,
    },
  ];
}

export async function getPageSeo(projectId: string): Promise<PageSeoView | null> {
  return safeQuery(
    "admin:project:seo",
    async () => {
      const project = await prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: {
          slug: true,
          heroImageUrl: true,
          ogImageUrl: true,
          canonicalUrl: true,
          sitemapPriority: true,
          sitemapChangeFreq: true,
          latitude: true,
          longitude: true,
          translations: {
            select: {
              locale: true,
              metaTitle: true,
              metaDescription: true,
              targetKeywords: true,
              noIndex: true,
            },
          },
        },
      });

      if (!project) return null;

      const perLocale: PageSeoLocaleData[] = (locales as readonly Locale[]).map((locale) => {
        const row = project.translations.find((t) => t.locale === locale);
        const title = trimmed(row?.metaTitle);
        const description = trimmed(row?.metaDescription);

        return {
          locale,
          title,
          description,
          keywords: row?.targetKeywords ?? [],
          noIndex: row?.noIndex ?? false,
          complete: title.length > 0 && description.length > 0,
        };
      });

      const structuredData = structuredDataFor(project);

      /*
        The checklist. Each entry is a thing that is either true of this
        page or not — no scores, no weighting. A language missing its
        description is named, because "8 of 10" without saying which two
        is a number nobody can act on.
      */
      const checks: SeoCheck[] = [
        ...perLocale.map((row) => ({
          key: "title",
          locale: row.locale,
          passed: row.title.length > 0 && row.title.length <= SEO_LIMITS.title,
        })),
        ...perLocale.map((row) => ({
          key: "description",
          locale: row.locale,
          passed:
            row.description.length > 0 && row.description.length <= SEO_LIMITS.description,
        })),
        {
          key: "shareImage",
          passed: Boolean(project.ogImageUrl ?? project.heroImageUrl),
        },
        {
          key: "breadcrumb",
          passed: structuredData.find((entry) => entry.type === "BreadcrumbList")?.emitted ?? false,
        },
      ];

      return {
        slug: project.slug,
        ogImageUrl: project.ogImageUrl,
        canonicalUrl: project.canonicalUrl,
        sitemapPriority: project.sitemapPriority,
        sitemapChangeFreq: project.sitemapChangeFreq,
        heroImageUrl: project.heroImageUrl,
        hasCoordinates: project.latitude !== null && project.longitude !== null,
        perLocale,
        checks,
        structuredData,
      };
    },
    null,
  );
}
