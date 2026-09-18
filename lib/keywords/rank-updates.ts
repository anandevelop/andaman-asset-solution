import "server-only";

/**
 * lib/keywords/rank-updates.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Turns a RankSourceResult (lib/keywords/source.ts) into Keyword writes —
 * the one place that happens, so a CSV import today and a Search Console
 * API sync later both go through the exact same rules.
 *
 * Keyword.phrase is globally unique, not unique per locale — a blind
 * upsert({where:{phrase}}) could silently attach a CSV row meant for one
 * language's report to a completely different language's tracked phrase
 * that happens to share the same text. Every write here checks across all
 * locales first and reports a cross-locale collision as an error; it never
 * guesses which locale a matching phrase "really" belongs to.
 *
 * Partial-success by design, unlike importUnitsCsv's all-or-nothing: a
 * malformed row is skipped and reported, every other row still applies.
 * Refusing a multi-thousand-row Search Console export over one bad row
 * would defeat the point of bulk rank tracking, and an admin importing a
 * real GSC report needs the 4,000 good rows applied regardless of the 3
 * bad ones.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/prisma";
import type { RankSourceResult } from "@/lib/keywords/source";

export type ApplyRankUpdatesResult = {
  created: number;
  updated: number;
  errors: { line?: number; query: string; reason: string }[];
};

type TrendPoint = { w: number; rank: number };

/** Up to 12 weeks of history — appends one point, dropping the oldest
 *  once there are more than 12. `w` is a sequence index, not a real
 *  calendar week (matching prisma/seed.ts's own weeklyTrend() convention):
 *  an import isn't guaranteed to land on a weekly cadence, so counting
 *  imports rather than calendar weeks is the honest thing to store. */
function nextTrend(existing: unknown, rank: number): TrendPoint[] {
  const points = Array.isArray(existing)
    ? (existing as TrendPoint[]).filter(
        (point): point is TrendPoint =>
          typeof point === "object" && point !== null && typeof point.w === "number" && typeof point.rank === "number",
      )
    : [];

  const next = [...points, { w: (points.at(-1)?.w ?? 0) + 1, rank }];
  return next.length > 12 ? next.slice(next.length - 12) : next;
}

export async function applyRankUpdates(result: RankSourceResult, locale: string): Promise<ApplyRankUpdatesResult> {
  const errors: ApplyRankUpdatesResult["errors"] = result.errors.map((error) => ({
    line: error.line,
    query: error.query ?? "",
    reason: error.reason,
  }));

  // De-dupe within the batch itself — same convention as importUnitsCsv's
  // DUPLICATE_IN_FILE, case-insensitive since a phrase's casing shouldn't
  // matter for matching.
  const seen = new Set<string>();
  const observations = result.observations.filter((observation) => {
    const key = observation.query.trim().toLowerCase();
    if (seen.has(key)) {
      errors.push({ query: observation.query, reason: "DUPLICATE_IN_FILE" });
      return false;
    }
    seen.add(key);
    return true;
  });

  if (observations.length === 0) return { created: 0, updated: 0, errors };

  const existing = await prisma.keyword.findMany({
    where: { phrase: { in: observations.map((o) => o.query.trim()), mode: "insensitive" } },
    select: { id: true, phrase: true, locale: true, currentRank: true, trend: true },
  });
  const existingByPhrase = new Map(existing.map((row) => [row.phrase.toLowerCase(), row]));

  const now = new Date();
  const updates: { id: string; data: Parameters<typeof prisma.keyword.update>[0]["data"] }[] = [];
  const creates: Parameters<typeof prisma.keyword.createMany>[0]["data"] = [];

  for (const observation of observations) {
    const phrase = observation.query.trim();
    const row = existingByPhrase.get(phrase.toLowerCase());

    if (!row) {
      creates.push({
        phrase,
        locale,
        currentRank: observation.position,
        previousRank: null,
        rankCheckedAt: now,
        trend: [{ w: 1, rank: observation.position }],
      });
      continue;
    }

    if (row.locale !== locale) {
      errors.push({ query: observation.query, reason: "PHRASE_TRACKED_IN_ANOTHER_LOCALE" });
      continue;
    }

    updates.push({
      id: row.id,
      data: {
        previousRank: row.currentRank,
        currentRank: observation.position,
        rankCheckedAt: now,
        trend: nextTrend(row.trend, observation.position),
      },
    });
  }

  await prisma.$transaction([
    ...updates.map(({ id, data }) => prisma.keyword.update({ where: { id }, data })),
    ...(creates.length > 0 ? [prisma.keyword.createMany({ data: creates })] : []),
  ]);

  return { created: creates.length, updated: updates.length, errors };
}
