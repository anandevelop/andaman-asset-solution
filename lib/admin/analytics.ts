import "server-only";

/**
 * lib/admin/analytics.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The one number this file adds that nothing else already computes: page
 * views over time, rather than the flat 30-day total lib/admin/news-list.ts
 * sums per article. Everything else the Analytics page shows — leads,
 * conversion, the four public-site stats — is read straight from
 * lib/reports.ts, lib/company-stats.ts and lib/admin/news-list.ts, on
 * purpose: this file exists to fill the one real gap, not to wrap what
 * already works.
 *
 * PAGE_VIEW rows only exist for paths app/api/page-view/route.ts's
 * COUNTED_PREFIXES actually counts — news articles today. The trend below
 * is therefore a news-reading trend, not site-wide traffic, and says so
 * rather than implying a number this application cannot honestly produce
 * (see that route's own header for why there is no GA4 read-back here).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PathHitKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { hitDay } from "@/lib/redirects";

export type PageViewDay = { day: string; count: number };

export type PageViewTrend = {
  /** One point per day in the window, oldest first, zero-filled — a day
   *  with no beacons is a real zero, not a gap the chart would otherwise
   *  draw as a break in the line. */
  days: PageViewDay[];
  totalViews: number;
  /** Null before the first beacon has ever landed. */
  countingSince: string | null;
};

/** Same window every other "30 days" figure on the admin uses. */
export const TREND_WINDOW_DAYS = 30;

export async function getPageViewTrend(windowDays = TREND_WINDOW_DAYS): Promise<PageViewTrend> {
  const empty: PageViewTrend = { days: [], totalViews: 0, countingSince: null };

  const DAY_MS = 24 * 60 * 60 * 1000;

  return safeQuery(
    "admin:pageViewTrend",
    async () => {
      const since = hitDay(new Date(Date.now() - (windowDays - 1) * DAY_MS));

      const [rows, firstDay] = await Promise.all([
        prisma.pathHitDay.groupBy({
          by: ["day"],
          where: { kind: PathHitKind.PAGE_VIEW, day: { gte: since } },
          _sum: { hits: true },
        }),
        prisma.pathHitDay.findFirst({
          where: { kind: PathHitKind.PAGE_VIEW },
          orderBy: { day: "asc" },
          select: { day: true },
        }),
      ]);

      const byDay = new Map(rows.map((row) => [row.day.toISOString().slice(0, 10), row._sum.hits ?? 0]));

      const days: PageViewDay[] = [];
      let totalViews = 0;
      for (let i = 0; i < windowDays; i += 1) {
        const key = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10);
        const count = byDay.get(key) ?? 0;
        days.push({ day: key, count });
        totalViews += count;
      }

      return { days, totalViews, countingSince: firstDay?.day.toISOString() ?? null };
    },
    empty,
  );
}
