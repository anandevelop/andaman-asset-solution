/**
 * lib/seo/collect.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Every URL the audit checks, and everything about it the database knows.
 *
 * The rendered half — canonical, hreflang, H1 count — is filled in later by
 * lib/seo/fetch-rendered.ts. This is the part that comes from rows, plus
 * the two facts that are about the corpus rather than any one page:
 * how many URLs share a title, and how many share a description.
 *
 * WHY NOT REUSE app/sitemap.ts
 *
 * It answers a different question. The sitemap needs a URL and a date; the
 * audit needs the translation row behind it — the meta description, the
 * per-locale noIndex, the image. Sharing the query would mean the sitemap
 * fetching columns it has no use for on every crawl of it. What they must
 * agree on is which URLs *exist*, and that agreement is enforced by both
 * reading the same two lists in lib/public-paths.ts and the same
 * published-content filters.
 *
 * A STATIC PAGE HAS NO ROW
 *
 * /about and /contact carry no translation record, so the rules that read
 * one would fail them every time for the same unfixable reason. They are
 * collected with their metadata marked absent and their entity null, and
 * the rules that genuinely do not apply — a missing meta description on a
 * page whose description lives in a message file — are the reason
 * SeoRuleWaiver exists.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { locales, type Locale } from "@/i18n";
import { STATIC_PATHS } from "@/lib/public-paths";
import type { SeoRuleInput } from "@/lib/seo/types";

/** Everything a rule needs except the rendered page and the link scan. */
export type CollectedUrl = Omit<SeoRuleInput, "rendered" | "brokenInternalLinks" | "duplicates"> & {
  entityType: string | null;
  entityId: string | null;
};

type TranslationRow = {
  locale: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  noIndex: boolean;
};

type Entity = {
  type: string;
  id: string;
  slug: string;
  prefix: string;
  imageUrl: string | null;
  translations: TranslationRow[];
};

export async function collectUrls(siteIndexable: boolean): Promise<CollectedUrl[]> {
  const [projects, articles, events, brochures] = await Promise.all([
    prisma.project.findMany({
      where: { isPublished: true, deletedAt: null },
      select: {
        id: true,
        slug: true,
        heroImageUrl: true,
        translations: {
          select: { locale: true, name: true, metaTitle: true, metaDescription: true, noIndex: true },
        },
      },
    }),
    prisma.newsArticle.findMany({
      where: { isPublished: true, deletedAt: null },
      select: {
        id: true,
        slug: true,
        coverImageUrl: true,
        ogImageUrl: true,
        translations: {
          select: { locale: true, title: true, metaTitle: true, metaDescription: true, noIndex: true },
        },
      },
    }),
    prisma.event.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        slug: true,
        coverImageUrl: true,
        translations: {
          select: { locale: true, title: true, metaTitle: true, metaDescription: true, noIndex: true },
        },
      },
    }),
    prisma.eBrochure.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        slug: true,
        coverImageUrl: true,
        // No metaTitle/metaDescription/noIndex columns — the PDF is the
        // content. `description` stands in, as lib/seo-audit.ts already
        // treats it.
        translations: { select: { locale: true, title: true, description: true } },
      },
    }),
  ]);

  const entities: Entity[] = [
    ...projects.map((row) => ({
      type: "PROJECT",
      id: row.id,
      slug: row.slug,
      prefix: "/projects",
      imageUrl: row.heroImageUrl,
      translations: row.translations.map((t) => ({ ...t, title: t.name })),
    })),
    ...articles.map((row) => ({
      type: "NEWS_ARTICLE",
      id: row.id,
      slug: row.slug,
      prefix: "/news",
      imageUrl: row.ogImageUrl ?? row.coverImageUrl,
      translations: row.translations,
    })),
    ...events.map((row) => ({
      type: "EVENT",
      id: row.id,
      slug: row.slug,
      prefix: "/events",
      imageUrl: row.coverImageUrl,
      translations: row.translations,
    })),
    ...brochures.map((row) => ({
      type: "E_BROCHURE",
      id: row.id,
      slug: row.slug,
      prefix: "/e-brochure",
      imageUrl: row.coverImageUrl,
      translations: row.translations.map((t) => ({
        locale: t.locale,
        title: t.title,
        metaTitle: null,
        metaDescription: t.description,
        noIndex: false,
      })),
    })),
  ];

  const collected: CollectedUrl[] = [];

  for (const entity of entities) {
    const localeCount = entity.translations.length;

    for (const locale of locales) {
      const row = entity.translations.find((t) => t.locale === locale);
      // A locale with no row still has a URL — it renders with a fallback,
      // which is exactly what translation-complete is there to flag. It
      // cannot be skipped or the gap would be invisible to the audit.
      collected.push({
        url: `/${locale}${entity.prefix}/${entity.slug}`,
        locale,
        slug: entity.slug,
        title: (row?.metaTitle || row?.title || "").trim(),
        metaDescription: (row?.metaDescription ?? "").trim(),
        noIndex: row?.noIndex ?? false,
        ogImageUrl: entity.imageUrl,
        localeCount,
        siteLocaleCount: locales.length,
        siteIndexable,
        entityType: entity.type,
        entityId: entity.id,
      });
    }
  }

  for (const path of STATIC_PATHS) {
    for (const locale of locales) {
      collected.push({
        url: path === "/" ? `/${locale}` : `/${locale}${path}`,
        locale,
        // "/" has no slug; the rest stand in for one so slug-length has
        // something honest to measure.
        slug: path === "/" ? "" : path.slice(1),
        // A static page's title and description come from message files,
        // not a row. Left empty, and the rules that read them are what
        // SeoRuleWaiver is for — see the header.
        title: "",
        metaDescription: "",
        noIndex: false,
        ogImageUrl: null,
        localeCount: locales.length,
        siteLocaleCount: locales.length,
        siteIndexable,
        entityType: null,
        entityId: null,
      });
    }
  }

  return collected;
}

/**
 * How many URLs share each title and each description.
 *
 * A fact about the corpus, counted once here rather than by two rules each
 * deciding how. Empty values are not counted: a hundred pages with no
 * description are one problem (meta-description), not also a hundred-way
 * duplicate.
 */
export function countDuplicates(urls: readonly CollectedUrl[]): {
  title: Map<string, number>;
  metaDescription: Map<string, number>;
} {
  const title = new Map<string, number>();
  const metaDescription = new Map<string, number>();

  for (const url of urls) {
    if (url.title) title.set(url.title, (title.get(url.title) ?? 0) + 1);
    if (url.metaDescription) {
      metaDescription.set(url.metaDescription, (metaDescription.get(url.metaDescription) ?? 0) + 1);
    }
  }

  return { title, metaDescription };
}

/** The locale a URL belongs to, for callers that only have the string. */
export function localeOfUrl(url: string): Locale {
  const match = url.match(new RegExp(`^/(${locales.join("|")})(/|$)`));
  return (match?.[1] as Locale) ?? locales[0];
}
