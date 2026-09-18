import "server-only";

/**
 * lib/admin/news-list.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The article index (News.dc.html): filters, sorting, paging, and the two
 * numbers the screen is really about.
 *
 * THE POINT OF THIS SCREEN IS THE PAIR, NOT EITHER COLUMN
 *
 * Views say how many people read an article. Leads say how many of them
 * became somebody the sales team can call. An article with four thousand
 * readers and two leads and one with a thousand readers and fourteen are
 * telling an editor to write completely different things next, and only
 * the two numbers side by side say that.
 *
 * Both are counted, neither is modelled:
 *
 *  · Views are PathHitDay rows written by the beacon on the article page
 *    (app/api/page-view/route.ts). Real requests, aggregated per day, no
 *    identifiers.
 *
 *  · Leads come from lib/news-leads.ts, which reads the utm_campaign the
 *    article's own CTA puts on the link. That undercounts on purpose — a
 *    reader who comes back through search two days later and enquires is
 *    not attributed here, because nothing honestly connects them. The
 *    column heading says "from this article", and every one of them is.
 *
 * Nothing on this screen is modelled, estimated or blended. A zero means
 * zero, not "no data".
 * ─────────────────────────────────────────────────────────────────────────
 */

import { ContentStatus, PathHitKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { hitDay } from "@/lib/redirects";
import { getLeadCountsByArticleSlug } from "@/lib/news-leads";
import { isArticleLiveNow } from "@/lib/news";
import { locales, type Locale } from "@/i18n";

export const ARTICLES_PER_PAGE = 10;
export const PER_PAGE_OPTIONS = [10, 25, 50] as const;

/** The window the views column is summed over. */
export const VIEW_WINDOW_DAYS = 30;

/**
 * How complete one language is for one article.
 *
 * Three states rather than two, because "started" and "not started" are
 * different jobs: a translator picking up work wants the half-finished
 * ones, and an editor deciding what to publish wants the ones nobody has
 * touched. A boolean would hide the difference.
 */
export type LocaleState = "done" | "partial" | "missing";

/** Fields a language needs before its version of the page reads properly.
 *  Meta copy is deliberately not in here — an article missing only its
 *  meta description is a job for the SEO screen, not a half-translation. */
const REQUIRED_FIELDS = ["title", "content"] as const;

/** The wider 6-field set the editor's own per-locale completion ring uses
 *  (components/admin/LanguageTabs.tsx's `percent` prop) — deliberately a
 *  separate constant from REQUIRED_FIELDS above rather than a shared one:
 *  that one drives this file's own list-filtering logic (translationIncomplete,
 *  incompleteOnly) and keeps its narrower, considered scope; this one is a
 *  finer-grained completeness signal for the editor itself, and the two are
 *  free to diverge without either silently changing the other's meaning. */
export const NEWS_COMPLETENESS_FIELDS = [
  "title",
  "excerpt",
  "content",
  "metaTitle",
  "metaDescription",
  "focusKeyword",
] as const;

export type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  authorName: string | null;
  coverImageUrl: string | null;
  status: "published" | "scheduled" | "inReview" | "draft";
  publishedAt: string | null;
  updatedAt: string;
  localeStates: Record<Locale, LocaleState>;
  /** True when any language is short of `done`. */
  translationIncomplete: boolean;
  views30: number;
  leads: number;
};

export type NewsFilters = {
  search: string;
  category: string;
  status: string;
  author: string;
  incompleteOnly: boolean;
  sort: string;
  page: number;
  perPage: number;
};

export type NewsListView = {
  rows: ArticleRow[];
  /** Rows matching the filters, before paging. */
  total: number;
  /** Counts across every article, filters ignored — the footer's summary. */
  totalAll: number;
  publishedCount: number;
  draftCount: number;
  /** Articles short of a full translation, for the filter chip. */
  incompleteCount: number;
  categories: string[];
  authors: { id: string; name: string }[];
  page: number;
  pageCount: number;
  /** First day the view counter has any row for, so the column can say
   *  since when it has been counting. Null before the first beacon. */
  countingSince: string | null;
};

export const EMPTY_VIEW: NewsListView = {
  rows: [],
  total: 0,
  totalAll: 0,
  publishedCount: 0,
  draftCount: 0,
  incompleteCount: 0,
  categories: [],
  authors: [],
  page: 1,
  pageCount: 1,
  countingSince: null,
};

export const SORT_OPTIONS = ["views", "leads", "recent", "title"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export function parseFilters(params: Record<string, string | string[] | undefined>): NewsFilters {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };

  const perPage = Number(one("perPage"));
  const page = Number(one("page"));
  const sort = one("sort");

  return {
    search: one("q").trim(),
    category: one("category") || "ALL",
    status: one("status") || "ALL",
    author: one("author") || "ALL",
    incompleteOnly: one("incomplete") === "1",
    sort: (SORT_OPTIONS as readonly string[]).includes(sort) ? sort : "views",
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    perPage: (PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
      ? perPage
      : ARTICLES_PER_PAGE,
  };
}

type TranslationRow = Record<string, unknown> & { locale: string };

function localeStatesOf(translations: TranslationRow[]): Record<Locale, LocaleState> {
  const states = {} as Record<Locale, LocaleState>;

  for (const locale of locales as readonly Locale[]) {
    const row = translations.find((translation) => translation.locale === locale);

    if (!row) {
      states[locale] = "missing";
      continue;
    }

    const filled = REQUIRED_FIELDS.filter(
      (field) => ((row[field] as string | null) ?? "").trim().length > 0,
    ).length;

    states[locale] = filled === REQUIRED_FIELDS.length ? "done" : filled === 0 ? "missing" : "partial";
  }

  return states;
}

function statusOf(
  article: { isPublished: boolean; publishedAt: Date | null; contentStatus: ContentStatus },
  now: Date,
): ArticleRow["status"] {
  // Order matters: an article can be IN_REVIEW and have an old publishedAt
  // from a previous run, and what an editor needs to see is the review.
  if (article.contentStatus === ContentStatus.IN_REVIEW) return "inReview";
  if (!article.isPublished) return "draft";
  // isArticleLiveNow() is also false for isPublished:true with a null
  // publishedAt (a pre-Phase-6 approveAndPublish could produce that) —
  // "scheduled" is the more honest read of that state than "published",
  // since nothing is actually showing on the public site yet.
  if (isArticleLiveNow(article, now)) return "published";
  return "scheduled";
}

/** Sum of PAGE_VIEW day rows inside the window, keyed by article slug. */
async function viewsBySlug(): Promise<Map<string, number>> {
  const since = hitDay(new Date(Date.now() - VIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000));

  const groups = await prisma.pathHitDay.groupBy({
    by: ["path"],
    where: { kind: PathHitKind.PAGE_VIEW, day: { gte: since }, path: { startsWith: "/news/" } },
    _sum: { hits: true },
  });

  return new Map(
    groups.map((group) => [group.path.slice("/news/".length), group._sum.hits ?? 0]),
  );
}

export async function getNewsList(filters: NewsFilters): Promise<NewsListView> {
  return safeQuery(
    "admin:news:list",
    async () => {
      const now = new Date();

      /*
        Every article is read, then filtered and sorted in memory.

        Deliberate, and the reason is the two columns this screen exists
        for: views live in PathHitDay keyed by path and leads in
        LeadInquiry keyed by utm_campaign, so neither can be joined or
        ordered by in SQL. Sorting "most read first" in the database is
        simply not expressible. This is a newsroom's article list — tens of
        rows, not tens of thousands — and if it ever stops being that, the
        fix is a counter column on NewsArticle, not a cleverer query here.
      */
      const [articles, viewCounts] = await Promise.all([
        prisma.newsArticle.findMany({
          where: { deletedAt: null },
          orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
          select: {
            id: true,
            slug: true,
            titleEn: true,
            titleTh: true,
            category: true,
            coverImageUrl: true,
            isPublished: true,
            publishedAt: true,
            updatedAt: true,
            contentStatus: true,
            authorId: true,
            author: { select: { id: true, name: true } },
            translations: {
              select: { locale: true, title: true, content: true },
            },
          },
        }),
        viewsBySlug(),
      ]);

      const leadCounts = await getLeadCountsByArticleSlug(articles.map((article) => article.slug));

      const all: (ArticleRow & { authorId: string | null })[] = articles.map((article) => {
        const localeStates = localeStatesOf(article.translations as TranslationRow[]);

        return {
          id: article.id,
          slug: article.slug,
          // The Thai title with the English as the fallback: this back
          // office is worked in Thai, and an article whose Thai title is
          // missing is better shown by its English one than by its id.
          title: article.titleTh || article.titleEn,
          category: article.category,
          authorId: article.authorId,
          authorName: article.author?.name ?? null,
          coverImageUrl: article.coverImageUrl,
          status: statusOf(article, now),
          publishedAt: article.publishedAt?.toISOString() ?? null,
          updatedAt: article.updatedAt.toISOString(),
          localeStates,
          translationIncomplete: (locales as readonly Locale[]).some(
            (locale) => localeStates[locale] !== "done",
          ),
          views30: viewCounts.get(article.slug) ?? 0,
          leads: leadCounts.get(article.slug) ?? 0,
        };
      });

      const search = filters.search.toLowerCase();

      const matches = all.filter((row) => {
        if (search && !`${row.title} ${row.slug}`.toLowerCase().includes(search)) return false;
        if (filters.category !== "ALL" && (row.category ?? "") !== filters.category) return false;
        if (filters.author !== "ALL" && (row.authorId ?? "") !== filters.author) return false;
        if (filters.incompleteOnly && !row.translationIncomplete) return false;

        if (filters.status !== "ALL") {
          if (filters.status === "published") {
            // "Published" means live now — a scheduled article is not.
            if (row.status !== "published") return false;
          } else if (row.status !== filters.status) return false;
        }

        return true;
      });

      const sorted = [...matches].sort((a, b) => {
        switch (filters.sort as SortOption) {
          case "leads":
            return b.leads - a.leads || b.views30 - a.views30;
          case "recent":
            return (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt);
          case "title":
            return a.title.localeCompare(b.title);
          case "views":
          default:
            return b.views30 - a.views30 || b.leads - a.leads;
        }
      });

      const pageCount = Math.max(1, Math.ceil(sorted.length / filters.perPage));
      const page = Math.min(Math.max(1, filters.page), pageCount);
      const start = (page - 1) * filters.perPage;

      const firstDay = await prisma.pathHitDay.findFirst({
        where: { kind: PathHitKind.PAGE_VIEW },
        orderBy: { day: "asc" },
        select: { day: true },
      });

      const authors = new Map<string, string>();
      const categories = new Set<string>();
      for (const row of all) {
        if (row.authorId && row.authorName) authors.set(row.authorId, row.authorName);
        if (row.category) categories.add(row.category);
      }

      return {
        rows: sorted.slice(start, start + filters.perPage).map(({ authorId: _authorId, ...row }) => row),
        total: sorted.length,
        totalAll: all.length,
        /*
          Counted over the filtered set, not over everything.

          The footer reads "showing 1–10 of 38 · 30 published · 8 drafts",
          so the three numbers have to describe one set — taking the total
          from the filter and the breakdown from the whole table produced
          "7 articles · 6 published · 2 drafts", which does not add up and
          leaves the reader working out which number lied.
        */
        publishedCount: matches.filter((row) => row.status === "published").length,
        draftCount: matches.filter((row) => row.status === "draft" || row.status === "inReview").length,
        incompleteCount: all.filter((row) => row.translationIncomplete).length,
        categories: [...categories].sort(),
        authors: [...authors].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        page,
        pageCount,
        countingSince: firstDay?.day.toISOString() ?? null,
      };
    },
    EMPTY_VIEW,
  );
}
