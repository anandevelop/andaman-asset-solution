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
import { truncate, readingMinutesFromText } from "@/lib/markdown-text";
import { getPlainText, type ContentFormat } from "@/lib/content-stats";

export type ArticleCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string | null;
  tags: string[];
  coverImageUrl: string | null;
  /** Manual social-share override — see NewsArticle.ogImageUrl's
   *  schema.prisma comment. Null falls back to coverImageUrl. */
  ogImageUrl: string | null;
  publishedAt: Date | null;
  authorName: string | null;
  /** Whole minutes, from the body's own length — see lib/markdown.ts.
   *  Carried on the card because the index's lead story shows it, and
   *  re-reading the body there to work it out would mean a second query
   *  for something already in hand. */
  readingMinutes: number;
};

export type ArticleDetail = ArticleCard & {
  /** Raw Markdown, or sanitized HTML — see `contentFormat`. The page picks
   *  renderMarkdown() vs sanitizeArticleHtml() (both lib/markdown.ts) based
   *  on which this is. */
  content: string;
  /** Which of the two `content` is — see schema.prisma's ArticleFormat
   *  comment for why both exist rather than one converting the other. */
  contentFormat: ContentFormat;
  metaTitle: string;
  metaDescription: string;
  /// Per-locale opt-out of indexing — see the schema.prisma comment on
  /// NewsArticleTranslation.noIndex.
  noIndex: boolean;
  updatedAt: Date;
  /** JSON-LD @type for the article schema this page emits — see
   *  lib/article-schema.ts. Defaults to "NewsArticle" for rows written
   *  before this column existed. */
  schemaType: string;
  /** Overrides the page's self-referential canonical URL — see the
   *  schema.prisma comment on NewsArticle.canonicalUrl. Null is the
   *  common case (no override). */
  canonicalUrl: string | null;
};

/**
 * Whether an article is actually visible to a visitor right now — the one
 * definition of "live". For a row already in hand (not a fresh query); see
 * publishedWhere() below for the SQL-level equivalent used when the
 * database itself should do the filtering.
 *
 * Also used by lib/admin/news-list.ts's per-row status and the news editor's
 * own "live" permalink check — three independent re-derivations of this
 * exact boolean existed before this function did, which is exactly the
 * kind of duplication that lets a scheduling bug slip in unnoticed.
 */
export function isArticleLiveNow(
  article: { isPublished: boolean; publishedAt: Date | null },
  now: Date = new Date(),
): boolean {
  return article.isPublished && article.publishedAt !== null && article.publishedAt <= now;
}

/** The live-article predicate, shared by every read below. */
function publishedWhere(): Prisma.NewsArticleWhereInput {
  return {
    isPublished: true,
    deletedAt: null,
    publishedAt: { not: null, lte: new Date() },
  };
}

// `satisfies Prisma.NewsArticleSelect` is back. It was dropped when the
// generated client did not yet type the `translations` relation; it does
// now, and this is the line that catches a field renamed in schema.prisma
// but not here — the failure this file would otherwise hit at runtime.
const CARD_SELECT = {
  id: true,
  slug: true,
  titleEn: true,
  titleTh: true,
  excerptEn: true,
  excerptTh: true,
  contentEn: true,
  contentTh: true,
  contentFormat: true,
  category: true,
  tags: true,
  coverImageUrl: true,
  ogImageUrl: true,
  publishedAt: true,
  author: { select: { name: true } },
  translations: true,
} satisfies Prisma.NewsArticleSelect;

type CardRow = any;

function toCard(row: CardRow, locale: string): ArticleCard {
  const t = getTranslation<any>(row.translations, locale);
  const excerpt = t?.excerpt ?? pickLocale(locale, row.excerptTh, row.excerptEn);
  const content = t?.content ?? pickLocale(locale, row.contentTh, row.contentEn);
  const format: ContentFormat = row.contentFormat ?? "MARKDOWN";
  const plainText = getPlainText(content, format);

  return {
    id: row.id,
    slug: row.slug,
    title: t?.title ?? pickLocale(locale, row.titleTh, row.titleEn),
    // An empty excerpt is common — editors skip it. Derive one from the
    // body rather than shipping a card with a blank paragraph.
    excerpt: excerpt || truncate(plainText),
    category: row.category,
    tags: row.tags,
    coverImageUrl: row.coverImageUrl,
    ogImageUrl: row.ogImageUrl,
    publishedAt: row.publishedAt,
    authorName: row.author?.name ?? null,
    readingMinutes: readingMinutesFromText(plainText),
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
      prisma.newsArticle.findMany({
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

/** How many cards the newsroom index shows per page. */
export const ARTICLES_PER_PAGE = 7;

export type ArticlePage = {
  articles: ArticleCard[];
  /** Matching the filters, across every page. */
  total: number;
  page: number;
  pageCount: number;
};

/**
 * Search across both the translation rows and the deprecated EN/TH column
 * pair.
 *
 * Both, because this table has articles from before the 4-locale migration
 * whose text only exists in the old columns, and a search that quietly
 * skipped those would look like the articles had been deleted. Title and
 * excerpt only — searching the body would match a passing mention of
 * "Layan" in an article about something else and bury the one that is
 * actually about it.
 */
function searchWhere(term: string): Prisma.NewsArticleWhereInput {
  const contains = { contains: term, mode: "insensitive" as const };

  return {
    OR: [
      { titleEn: contains },
      { titleTh: contains },
      { excerptEn: contains },
      { excerptTh: contains },
      { translations: { some: { OR: [{ title: contains }, { excerpt: contains }] } } },
    ],
  };
}

/**
 * One page of the newsroom index.
 *
 * Separate from getPublishedArticles rather than another set of options on
 * it: that one is called by the home page and the "related" strip, which
 * want a fixed handful and no count, and giving it a page number would put
 * an extra COUNT query on both for a number neither renders.
 */
export async function getPublishedArticlePage(
  locale: string,
  options: { category?: string; search?: string; page?: number; perPage?: number } = {},
): Promise<ArticlePage> {
  const perPage = options.perPage ?? ARTICLES_PER_PAGE;
  const search = options.search?.trim() ?? "";

  const where: Prisma.NewsArticleWhereInput = {
    ...publishedWhere(),
    ...(options.category ? { category: options.category } : {}),
    ...(search ? searchWhere(search) : {}),
  };

  const total = await safeQuery(
    "newsArticle.count(published)",
    () => prisma.newsArticle.count({ where }),
    0,
  );

  const pageCount = Math.max(1, Math.ceil(total / perPage));
  // Clamped rather than trusted: "?page=99" on a two-page list should show
  // the last page, not an empty one with no explanation.
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);

  const rows = await safeQuery(
    "newsArticle.findMany(page)",
    () =>
      prisma.newsArticle.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        select: CARD_SELECT,
      }),
    [] as CardRow[],
  );

  return { articles: rows.map((row) => toCard(row, locale)), total, page, pageCount };
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
        prisma.newsArticle.findUnique({
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
            schemaType: true,
            canonicalUrl: true,
          },
        }),
      null,
    );

    if (!row || row.deletedAt || !isArticleLiveNow(row)) return null;

    const card = toCard(row, locale);
    const t = getTranslation<any>(row.translations, locale);
    const content = t?.content ?? pickLocale(locale, row.contentTh, row.contentEn);

    return {
      ...card,
      content,
      contentFormat: row.contentFormat ?? "MARKDOWN",
      metaTitle: (t?.metaTitle ?? pickLocale(locale, row.metaTitleTh, row.metaTitleEn)) || card.title,
      metaDescription:
        (t?.metaDescription ?? pickLocale(locale, row.metaDescriptionTh, row.metaDescriptionEn)) ||
        card.excerpt,
      noIndex: t?.noIndex ?? false,
      updatedAt: row.updatedAt,
      schemaType: row.schemaType ?? "NewsArticle",
      canonicalUrl: row.canonicalUrl ?? null,
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
