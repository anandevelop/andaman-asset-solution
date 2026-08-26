/**
 * lib/news.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only data access for NewsArticle, mirroring lib/projects.ts.
 *
 * "Published" here means isPublished AND publishedAt <= now AND not soft
 * deleted. The publishedAt check is what makes scheduling work: an editor
 * can tick publish with a future date and the article stays invisible until
 * that moment, without anyone having to come back and flip a switch.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { pickLocale } from "@/lib/locale";
import { getTranslation } from "@/lib/get-translation";
import { markdownToText, truncate } from "@/lib/markdown";

export type ArticleCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string | null;
  tags: string[];
  coverImageUrl: string | null;
  publishedAt: Date | null;
  authorName: string | null;
};

export type ArticleDetail = ArticleCard & {
  /** Raw Markdown — the page renders it through lib/markdown. */
  content: string;
  metaTitle: string;
  metaDescription: string;
  updatedAt: Date;
};

/** The live-article predicate, shared by every read below. */
function publishedWhere(): Prisma.NewsArticleWhereInput {
  return {
    isPublished: true,
    deletedAt: null,
    publishedAt: { not: null, lte: new Date() },
  };
}

// Not `satisfies Prisma.NewsArticleSelect` — `translations` is a relation
// added to NewsArticle in this phase (see schema.prisma's NewsArticle
// model) that the locally generated Prisma client doesn't type yet; same
// `prisma as any` sandbox situation as getProjectBySlug in lib/projects.ts.
const CARD_SELECT = {
  id: true,
  slug: true,
  titleEn: true,
  titleTh: true,
  excerptEn: true,
  excerptTh: true,
  contentEn: true,
  contentTh: true,
  category: true,
  tags: true,
  coverImageUrl: true,
  publishedAt: true,
  author: { select: { name: true } },
  translations: true,
};

type CardRow = any;

function toCard(row: CardRow, locale: string): ArticleCard {
  const t = getTranslation<any>(row.translations, locale);
  const excerpt = t?.excerpt ?? pickLocale(locale, row.excerptTh, row.excerptEn);
  const content = t?.content ?? pickLocale(locale, row.contentTh, row.contentEn);

  return {
    id: row.id,
    slug: row.slug,
    title: t?.title ?? pickLocale(locale, row.titleTh, row.titleEn),
    // An empty excerpt is common — editors skip it. Derive one from the
    // body rather than shipping a card with a blank paragraph.
    excerpt: excerpt || truncate(markdownToText(content)),
    category: row.category,
    tags: row.tags,
    coverImageUrl: row.coverImageUrl,
    publishedAt: row.publishedAt,
    authorName: row.author?.name ?? null,
  };
}

/** Published articles, newest first. `category` filters when supplied. */
export async function getPublishedArticles(
  locale: string,
  options: { category?: string; take?: number; excludeSlug?: string } = {},
): Promise<ArticleCard[]> {
  const rows = await safeQuery(
    "newsArticle.findMany(published)",
    () =>
      (prisma as any).newsArticle.findMany({
        where: {
          ...publishedWhere(),
          ...(options.category ? { category: options.category } : {}),
          ...(options.excludeSlug ? { slug: { not: options.excludeSlug } } : {}),
        },
        orderBy: { publishedAt: "desc" },
        take: options.take,
        select: CARD_SELECT,
      }),
    [] as CardRow[],
  );

  return rows.map((row) => toCard(row, locale));
}

/**
 * One published article by slug. Returns null for unknown, unpublished or
 * future-dated slugs — the page turns that into a 404.
 * cache() dedupes between generateMetadata() and the page body.
 */
export const getArticleBySlug = cache(
  async (slug: string, locale: string): Promise<ArticleDetail | null> => {
    const row = await safeQuery<any>(
      `newsArticle.findUnique(${slug})`,
      () =>
        (prisma as any).newsArticle.findUnique({
          where: { slug },
          select: {
            ...CARD_SELECT,
            metaTitleEn: true,
            metaTitleTh: true,
            metaDescriptionEn: true,
            metaDescriptionTh: true,
            isPublished: true,
            deletedAt: true,
            updatedAt: true,
          },
        }),
      null,
    );

    if (!row || !row.isPublished || row.deletedAt) return null;
    if (!row.publishedAt || row.publishedAt > new Date()) return null;

    const card = toCard(row, locale);
    const t = getTranslation<any>(row.translations, locale);
    const content = t?.content ?? pickLocale(locale, row.contentTh, row.contentEn);

    return {
      ...card,
      content,
      metaTitle: (t?.metaTitle ?? pickLocale(locale, row.metaTitleTh, row.metaTitleEn)) || card.title,
      metaDescription:
        (t?.metaDescription ?? pickLocale(locale, row.metaDescriptionTh, row.metaDescriptionEn)) ||
        card.excerpt,
      updatedAt: row.updatedAt,
    };
  },
);

/** Slugs for generateStaticParams(). */
export async function getPublishedArticleSlugs(): Promise<string[]> {
  const rows = await safeQuery(
    "newsArticle.findMany(slugs)",
    () =>
      prisma.newsArticle.findMany({
        where: publishedWhere(),
        select: { slug: true },
      }),
    [] as { slug: string }[],
  );
  return rows.map((row) => row.slug);
}

/** Published-article rows for the sitemap: slug + last modification. */
export async function getArticleSitemapEntries(): Promise<
  { slug: string; updatedAt: Date }[]
> {
  return safeQuery(
    "newsArticle.findMany(sitemap)",
    () =>
      prisma.newsArticle.findMany({
        where: publishedWhere(),
        select: { slug: true, updatedAt: true },
        orderBy: { publishedAt: "desc" },
      }),
    [] as { slug: string; updatedAt: Date }[],
  );
}

/** Distinct categories in use, for the listing filter chips. */
export async function getArticleCategories(): Promise<string[]> {
  const rows = await safeQuery(
    "newsArticle.groupBy(category)",
    () =>
      prisma.newsArticle.findMany({
        where: { ...publishedWhere(), category: { not: null } },
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
      }),
    [] as { category: string | null }[],
  );

  return rows.map((row) => row.category).filter((c): c is string => Boolean(c));
}
