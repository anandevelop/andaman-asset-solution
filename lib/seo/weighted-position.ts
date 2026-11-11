import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Average position per query, weighted by impressions — what Search
 * Console itself means by "average position". Prisma's groupBy can only
 * take a plain mean of the rows, and there is one row per (date, query,
 * page, device): a phrase seen once at 3 on one page and 400 times at 30 on
 * another came out as 16.5. Summed here instead.
 *
 * Keyed by the query lower-cased. Queries with no impressions are left
 * out (their position is not defined).
 */
export async function weightedPositions(where: Prisma.SeoQueryStatWhereInput): Promise<Map<string, number>> {
  const rows = await prisma.seoQueryStat.findMany({
    where,
    select: { query: true, impressions: true, position: true },
  });

  const totals = new Map<string, { weighted: number; impressions: number }>();
  for (const row of rows) {
    if (row.impressions <= 0) continue;
    const key = row.query.toLowerCase();
    const t = totals.get(key) ?? { weighted: 0, impressions: 0 };
    t.weighted += row.position * row.impressions;
    t.impressions += row.impressions;
    totals.set(key, t);
  }

  return new Map([...totals].map(([key, t]) => [key, t.weighted / t.impressions]));
}
