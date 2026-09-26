/**
 * lib/seo/search-sync.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Pulling Search Console into this database, and making Keyword.currentRank
 * mean something.
 *
 * ONE SOURCE FOR A RANK
 *
 * `Keyword.currentRank` was a number somebody typed in after looking at
 * Google themselves. Two people checking on different days, from different
 * places, with different personalisation, produced numbers that disagreed
 * with each other and with what the site actually gets — and nothing on
 * screen said which was which. It is written here now, from the average
 * position Search Console reports for that exact phrase, and nowhere else.
 *
 * A phrase nobody searched for in the window keeps its previous rank
 * rather than being reset: "nobody searched this" and "we fell off the
 * results" are different facts and only one of them is bad news.
 *
 * THE FIRST RUN IS NOT LIKE THE OTHERS
 *
 * Search Console keeps sixteen months and no more, so the first sync takes
 * all of it — that history can never be recovered later, and every
 * comparison the reports draw is measured against it. Subsequent runs take
 * a short window, because Google keeps revising the last few days after
 * first reporting them.
 *
 * WHY THE WINDOW OVERLAPS
 *
 * Re-reading days already stored looks wasteful and is the entire reason
 * the figures end up correct. Google finalises a day over the following
 * two or three; a job that only ever asked for yesterday would store its
 * first draft and never learn the rest. The write is an upsert on the
 * day's own grain, so re-reading corrects rather than duplicates.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import {
  earliestAvailable,
  latestSettled,
  querySearchAnalytics,
  type SearchRow,
} from "@/lib/seo/search-console";

/** How far back a routine run re-reads, to catch Google's revisions. */
export const OVERLAP_DAYS = 5;

export type SyncResult = {
  firstRun: boolean;
  startDate: string;
  endDate: string;
  rowsWritten: number;
  keywordsRanked: number;
};

export type SyncOutcome = { ok: true; result: SyncResult } | { ok: false; error: string };

/**
 * The window to ask for.
 *
 * Exported because it decides whether sixteen months or five days of API
 * calls happen, and that is worth being able to test without a network.
 */
export function syncWindow(
  latestStored: Date | null,
  now: Date = new Date(),
): { startDate: string; endDate: string; firstRun: boolean } {
  const endDate = latestSettled(now);

  if (!latestStored) {
    return { startDate: earliestAvailable(now), endDate, firstRun: true };
  }

  const start = new Date(latestStored);
  start.setUTCDate(start.getUTCDate() - OVERLAP_DAYS);

  return { startDate: start.toISOString().slice(0, 10), endDate, firstRun: false };
}

/**
 * Pull the window and store it.
 *
 * Dimensioned by date, query, page and device — the grain SeoQueryStat is
 * keyed on, so a re-read of the same day replaces rather than doubles.
 */
export async function syncSearchConsole(options: {
  siteUrl: string;
  now?: Date;
}): Promise<SyncOutcome> {
  const now = options.now ?? new Date();

  const latest = await prisma.seoQueryStat.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });

  const window = syncWindow(latest?.date ?? null, now);

  const response = await querySearchAnalytics({
    siteUrl: options.siteUrl,
    startDate: window.startDate,
    endDate: window.endDate,
    dimensions: ["date", "query", "page", "device"],
    // FINAL only. ALL would include days Google is still revising, and
    // those drafts would be stored as though settled.
    dataState: "FINAL",
  });

  if (!response.ok) return { ok: false, error: response.error };

  const rowsWritten = await storeRows(response.rows);
  const keywordsRanked = await updateKeywordRanks(window.startDate, window.endDate);

  return {
    ok: true,
    result: {
      firstRun: window.firstRun,
      startDate: window.startDate,
      endDate: window.endDate,
      rowsWritten,
      keywordsRanked,
    },
  };
}

/** Rows arrive keyed [date, query, page, device] in that order. */
async function storeRows(rows: readonly SearchRow[]): Promise<number> {
  let written = 0;

  /*
    Chunked, not one transaction. Sixteen months of a busy site is
    hundreds of thousands of rows, and a single transaction that size
    holds locks long enough to matter to a visitor's page render. A run
    that dies halfway leaves the days it managed, and the next run's
    overlap picks up the rest.
  */
  const CHUNK = 500;

  for (let index = 0; index < rows.length; index += CHUNK) {
    const chunk = rows.slice(index, index + CHUNK);

    await Promise.all(
      chunk.map((row) => {
        const [date, query, page, device] = row.keys;

        return prisma.seoQueryStat.upsert({
          where: {
            date_query_page_device: { date: new Date(date), query, page, device },
          },
          create: {
            date: new Date(date),
            query,
            page,
            device,
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          },
          update: {
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          },
        });
      }),
    );

    written += chunk.length;
  }

  return written;
}

/**
 * Write the rank of every phrase the team tracks.
 *
 * Averaged over the window weighted by impressions, which is what Search
 * Console's own "average position" means: a phrase seen once at position 3
 * and four hundred times at position 30 is not at position 16.
 */
async function updateKeywordRanks(startDate: string, endDate: string): Promise<number> {
  const keywords = await prisma.keyword.findMany({
    select: { id: true, phrase: true, currentRank: true },
  });

  if (keywords.length === 0) return 0;

  const stats = await prisma.seoQueryStat.groupBy({
    by: ["query"],
    where: { date: { gte: new Date(startDate), lte: new Date(endDate) } },
    _sum: { impressions: true },
    _avg: { position: true },
  });

  const byQuery = new Map(stats.map((row) => [row.query.toLowerCase(), row]));

  let ranked = 0;

  for (const keyword of keywords) {
    const stat = byQuery.get(keyword.phrase.trim().toLowerCase());

    /*
      No data is not a rank of zero, and not a fall. A phrase nobody
      searched in this window keeps whatever it last had — the screen
      shows when it was checked, so a stale number is visibly stale rather
      than silently wrong.
    */
    if (!stat?._avg.position) continue;

    const position = Math.round(stat._avg.position);

    await prisma.keyword.update({
      where: { id: keyword.id },
      data: {
        previousRank: keyword.currentRank,
        currentRank: position,
        rankCheckedAt: new Date(),
      },
    });

    ranked += 1;
  }

  return ranked;
}
