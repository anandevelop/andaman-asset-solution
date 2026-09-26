/**
 * lib/seo/keyword-report.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The three questions the keywords tab now answers from real data.
 *
 *   Tracked    — the phrases the team chose, with what they actually get.
 *   Untracked  — phrases Google is already sending people on, that nobody
 *                put in the library. Usually the most interesting list on
 *                the screen: it is what the site is found for, as opposed
 *                to what somebody hoped it would be found for.
 *   Opportunity— phrases sitting just off the first page, seen often
 *                enough to matter, and clicked less than their position
 *                would predict.
 *
 * WHAT MAKES AN OPPORTUNITY
 *
 * Position 5–15, at least a thousand impressions, and a click-through rate
 * below the median of this site's own rows at a similar position. The last
 * part is the one that makes it useful: an industry CTR curve says a
 * position-8 result "should" get 3%, but this site's Thai property
 * searches behave like this site's Thai property searches, and comparing
 * against itself is the only comparison that holds.
 *
 * The estimate attached to each — "this many more clicks if it reached the
 * median" — is arithmetic, not a forecast, and the screen says so. It is
 * there to sort the list, not to promise anybody a number.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

export type QueryStat = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/** Just off the first page: close enough that work on it can pay. */
export const OPPORTUNITY_MIN_POSITION = 5;
export const OPPORTUNITY_MAX_POSITION = 15;

/** Below this, a CTR is noise rather than a signal. */
export const OPPORTUNITY_MIN_IMPRESSIONS = 1_000;

/** How wide a band counts as "a similar position" when taking the median. */
const BAND_SIZE = 3;

export type Opportunity = QueryStat & {
  /** The median CTR of this site's own rows in the same position band. */
  medianCtr: number;
  /** Clicks this row would have had at that CTR. Arithmetic, not a
   *  forecast — see the header. */
  potentialClicks: number;
};

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Rows that are worth someone's afternoon, worst-performing first.
 *
 * Pure, and tested as such: the band arithmetic and the "compare against
 * itself" rule are where this either produces a useful list or a list of
 * everything.
 */
export function findOpportunities(rows: readonly QueryStat[]): Opportunity[] {
  const bandOf = (position: number) => Math.floor(position / BAND_SIZE);

  const ctrsByBand = new Map<number, number[]>();
  for (const row of rows) {
    // Every row informs the median, not just the candidates — a band
    // judged only on its own underperformers has a median that drifts
    // down to meet them.
    const band = bandOf(row.position);
    ctrsByBand.set(band, [...(ctrsByBand.get(band) ?? []), row.ctr]);
  }

  const opportunities: Opportunity[] = [];

  for (const row of rows) {
    if (row.position < OPPORTUNITY_MIN_POSITION) continue;
    if (row.position > OPPORTUNITY_MAX_POSITION) continue;
    if (row.impressions < OPPORTUNITY_MIN_IMPRESSIONS) continue;

    const medianCtr = median(ctrsByBand.get(bandOf(row.position)) ?? []);
    if (row.ctr >= medianCtr) continue;

    const potentialClicks = Math.round(row.impressions * (medianCtr - row.ctr));

    /*
      Below the median but by so little that closing the gap is worth no
      clicks at all. Technically an underperformer, practically a row that
      makes the list longer and less believable — and a list of things
      worth doing loses its authority the first time it suggests something
      that is not.
    */
    if (potentialClicks < 1) continue;

    opportunities.push({ ...row, medianCtr, potentialClicks });
  }

  return opportunities.sort((a, b) => b.potentialClicks - a.potentialClicks);
}

export type KeywordReport = {
  /** Aggregated per query over the window. */
  stats: QueryStat[];
  /** The last day Search Console has settled data for. */
  dataUpTo: Date | null;
  /** True when nothing has ever been synced — a different state from "no
   *  impressions this month". */
  empty: boolean;
};

/**
 * Every query the site was seen for in the window.
 *
 * Aggregated here rather than per page: a phrase that ranks on three of
 * our pages is one phrase somebody is searching, and splitting it three
 * ways makes every figure on the screen a third of the truth. The page
 * breakdown is a drill-down, not the default.
 */
export async function getKeywordReport(days = 28): Promise<KeywordReport> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  return safeQuery(
    "seo:keywordReport",
    async () => {
      const [grouped, latest, total] = await Promise.all([
        prisma.seoQueryStat.groupBy({
          by: ["query"],
          where: { date: { gte: since } },
          _sum: { clicks: true, impressions: true },
          _avg: { position: true },
        }),
        prisma.seoQueryStat.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
        prisma.seoQueryStat.count(),
      ]);

      const stats = grouped
        .map((row) => {
          const clicks = row._sum.clicks ?? 0;
          const impressions = row._sum.impressions ?? 0;

          return {
            query: row.query,
            clicks,
            impressions,
            // Recomputed from the totals rather than averaged: the mean of
            // daily CTRs weights a quiet Tuesday the same as a busy
            // Saturday and is not this window's click-through rate.
            ctr: impressions === 0 ? 0 : clicks / impressions,
            position: row._avg.position ?? 0,
          };
        })
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

      return { stats, dataUpTo: latest?.date ?? null, empty: total === 0 };
    },
    { stats: [], dataUpTo: null, empty: true },
  );
}

/** Which of these phrases the team already tracks, lowercased for
 *  comparison because a library entry and a search rarely agree on case. */
export async function trackedPhrases(): Promise<Set<string>> {
  const keywords = await safeQuery(
    "seo:trackedPhrases",
    () => prisma.keyword.findMany({ select: { phrase: true } }),
    [] as { phrase: string }[],
  );

  return new Set(keywords.map((row) => row.phrase.trim().toLowerCase()));
}
